import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@agile-tools/db';
import {
  DEFAULT_COMPLETED_WINDOW_DAYS,
  createPostgresJiraRateLimiter,
  claimConnectionSync,
  renewConnectionSync,
  releaseConnectionSync,
  getActiveHoldDefinition,
  listEpicForecastTargets,
  refreshEpicLinkForecastTargetCounts,
  updateJiraConnectionCapabilities,
} from '@agile-tools/db';
import {
  getConfig,
  decryptSecret,
  encryptSecret,
  isHostedMode,
  logger,
  metricsClock,
  recordSyncRun,
} from '@agile-tools/shared';
import {
  JiraClientError,
  createJiraClient,
  inferChangelogFetchStrategyFromServerInfo,
  getBoardDetailWithFilterId,
  normalizeChangelogFetchStrategy,
  fetchBoardIssues,
  streamBoardIssues,
  streamJqlIssues,
  fetchJqlIssueCount,
  refreshAtlassianOAuthToken,
} from '@agile-tools/jira-client';
import type { JiraClient, JiraChangelogFetchStrategy, RawJiraIssue } from '@agile-tools/jira-client';
import type { BoardColumn } from '@agile-tools/shared/contracts/api';
import { detectBoardDrift, applyBoardDriftHandling } from './detect-board-drift.js';
import { updateConnectionHealthAfterSync } from './update-connection-health.js';
import {
  normalizeJiraIssue,
  type NormalizeContext,
  type NormalizedWorkItem,
} from './normalize-jira-issues.js';
import { rebuildScopeProjections } from '../projections/rebuild-scope-summary.js';

import { loadIssueDetails } from './issue-cache.js';

type SyncNormalizeContext = NormalizeContext & { connectionId: string; leaseToken: string; cacheMaxAgeMs: number };

const BATCH_SIZE = 10;
const STAGED_ITEM_PAGE_SIZE = 100;
const SYNC_ISSUE_FIELDS = 'summary,status,issuetype,project,created,updated,resolutiondate,assignee,comment';

function quoteJqlValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function jqlList(values: string[]): string {
  return values.map(quoteJqlValue).join(', ');
}

function getCountableEpicStatusIds(
  columns: BoardColumn[],
  doneStatusIds: Set<string>,
): string[] {
  const statusIds: string[] = [];

  for (const column of columns) {
    for (const statusId of column.statusIds) {
      if (!doneStatusIds.has(statusId)) {
        statusIds.push(statusId);
      }
    }
  }

  return statusIds;
}

function buildEpicRemainingStoriesJql(
  issueKey: string,
  issueTypeIds: string[],
  countableStatusIds: string[],
): string | null {
  if (issueTypeIds.length === 0 || countableStatusIds.length === 0) {
    return null;
  }

  return [
    `"Epic Link" = ${quoteJqlValue(issueKey)}`,
    `issuetype in (${jqlList(issueTypeIds)})`,
    `status in (${jqlList(countableStatusIds)})`,
  ].join(' AND ');
}

interface JiraConnectionCapabilityFields {
  id: string;
  workspaceId: string;
  jiraVersion?: string | null;
  jiraDeploymentType?: string | null;
  changelogStrategy?: string | null;
}

class SyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

async function touchRunningSyncRun(
  db: PrismaClient,
  syncRunId: string,
  startedAt: Date,
): Promise<boolean> {
  const touched = await db.syncRun.updateMany({
    where: { id: syncRunId, status: 'running' },
    // Rewriting the claimed startedAt leaves the start timestamp stable while
    // still advancing updatedAt, which we use as the running-sync heartbeat.
    data: { startedAt },
  });

  return touched.count > 0;
}

async function requireRunningSyncRun(
  db: PrismaClient,
  syncRunId: string,
  startedAt: Date,
  connectionId: string,
  leaseToken: string,
): Promise<void> {
  if (!await renewConnectionSync(db, connectionId, syncRunId, leaseToken)) {
    throw new SyncError('SYNC_LEASE_LOST', 'Connection lease is no longer owned by this attempt');
  }
  const stillRunning = await touchRunningSyncRun(db, syncRunId, startedAt);
  if (!stillRunning) {
    throw new SyncError('SYNC_RUN_ABORTED', `SyncRun ${syncRunId} is no longer running`);
  }
}

async function finalizeRunningSyncRun(
  db: PrismaClient,
  syncRunId: string,
  data: {
    status: 'canceled' | 'failed' | 'succeeded';
    finishedAt: Date;
    dataVersion?: string;
    errorCode?: string;
    errorSummary?: string;
  },
): Promise<boolean> {
  const finalized = await db.syncRun.updateMany({
    where: { id: syncRunId, status: 'running' },
    data,
  });

  if (finalized.count === 0) {
    logger.warn('SyncRun left running state before terminal update; skipping', {
      syncRunId,
      nextStatus: data.status,
    });
    return false;
  }

  return true;
}

async function cleanupStagedWorkItems(db: PrismaClient, syncRunId: string): Promise<void> {
  await db.syncWorkItemStage.deleteMany({ where: { syncRunId } }).catch((cleanupErr: unknown) => {
    logger.warn('Failed to clean up staged work items', {
      syncRunId,
      error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
    });
  });
}

/**
 * Execute the full Jira sync pipeline for a single scope.
 *
 * The caller is responsible for ensuring a SyncRun row exists in `queued` status.
 * This function atomically transitions the run to `running` via an updateMany guard,
 * and on completion updates it to `succeeded` or `failed`.
 */
export async function runScopeSync(db: PrismaClient, syncRunId: string): Promise<void> {
  const syncStartedAt = metricsClock.now();
  const syncRun = await db.syncRun.findUnique({ where: { id: syncRunId } });
  if (!syncRun) {
    logger.error('SyncRun not found; skipping', { syncRunId });
    recordSyncRun({
      trigger: 'unknown',
      result: 'skipped',
      errorCode: 'SYNC_RUN_NOT_FOUND',
      durationSeconds: metricsClock.durationSecondsSince(syncStartedAt),
      itemCount: 0,
    });
    return;
  }
  const trigger = syncRun.trigger;
  let metricRecorded = false;

  function recordSyncMetric(result: string, errorCode?: string, itemCount = 0): void {
    if (metricRecorded) return;
    metricRecorded = true;
    recordSyncRun({
      trigger,
      result,
      durationSeconds: metricsClock.durationSecondsSince(syncStartedAt),
      itemCount,
      ...(errorCode !== undefined ? { errorCode } : {}),
    });
  }

  const claimedStartedAt = syncRun.startedAt ?? new Date();

  // Atomically claim: only advance if still in queued state, preventing duplicate execution.
  const claimed = await db.syncRun.updateMany({
    where: { id: syncRunId, status: 'queued' },
    data: { status: 'running', startedAt: claimedStartedAt },
  });
  if (claimed.count === 0) {
    logger.warn('SyncRun is not in queued state; skipping', {
      syncRunId,
      currentStatus: syncRun.status,
    });
    recordSyncMetric('skipped', 'SYNC_RUN_NOT_QUEUED');
    return;
  }
  // Staged batches survive rate-limit pauses.

  // Track connection context so the catch block can update health even on early errors.
  let scopeWorkspaceId: string | undefined;
  let scopeConnectionId: string | undefined;
  let leaseClaimed = false;
  const leaseToken = randomUUID();
  let syncClient: JiraClient | undefined;

  try {
    const scope = await db.flowScope.findUnique({ where: { id: syncRun.scopeId } });
    if (!scope) {
      throw new SyncError('SCOPE_NOT_FOUND', `FlowScope ${syncRun.scopeId} not found`);
    }

    scopeWorkspaceId = scope.workspaceId;
    scopeConnectionId = scope.connectionId;

    if (scope.status !== 'active') {
      const canceled = await finalizeRunningSyncRun(db, syncRunId, {
        status: 'canceled',
        finishedAt: new Date(),
        errorCode: 'SCOPE_NOT_ACTIVE',
      });
      if (!canceled) {
        return;
      }
      await cleanupStagedWorkItems(db, syncRunId);
      logger.info('Scope sync canceled: scope is not active', {
        syncRunId,
        scopeId: scope.id,
        scopeStatus: scope.status,
      });
      recordSyncMetric('canceled', 'SCOPE_NOT_ACTIVE');
      return;
    }

    const connection = await db.jiraConnection.findFirst({
      where: { id: scope.connectionId, workspaceId: scope.workspaceId },
    });
    if (!connection) {
      throw new SyncError(
        'CONNECTION_NOT_FOUND',
        `JiraConnection ${scope.connectionId} not found`,
      );
    }

    leaseClaimed = await claimConnectionSync(db, connection.id, syncRunId, leaseToken, connection.updatedAt);
    if (!leaseClaimed) {
      await db.syncRun.updateMany({ where: { id: syncRunId, status: 'running' }, data: {
        status: 'queued', errorCode: 'CONNECTION_BUSY', resumeAfter: new Date(Date.now() + 60_000),
      } });
      recordSyncMetric('paused', 'CONNECTION_BUSY');
      return;
    }
    let lastHeartbeat = 0;
    const heartbeat = async () => {
      if (Date.now() - lastHeartbeat < 15_000) return;
      await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
      lastHeartbeat = Date.now();
    };
    const fullResync = syncRun.fullResync || !scope.lastFullSyncAt ||
      Date.now() - scope.lastFullSyncAt.getTime() >= getConfig().SYNC_FULL_RESYNC_HOURS * 3_600_000;
    await db.syncRun.updateMany({ where: { id: syncRunId, status: 'running' }, data: { fullResync, resumeAfter: null } });
    const token = await resolveJiraAccessToken(db, connection);
    const initialChangelogStrategy = getInitialChangelogFetchStrategy(connection);
    const jiraClient = createJiraClient(connection.baseUrl, token, {
      connectionId: connection.id, scopeId: scope.id, syncRunId,
      rateLimiter: createPostgresJiraRateLimiter(db, connection.id, connection.requestBudgetPerMinute, connection),
      retryBudgetMs: getConfig().JIRA_RATE_RETRY_BUDGET_MS,
      onProgress: heartbeat,
      ...(initialChangelogStrategy !== undefined
        ? { changelogFetchStrategy: initialChangelogStrategy }
        : {}),
      onChangelogFetchStrategyDetected: (strategy) =>
        persistChangelogStrategy(db, connection, strategy),
    });
    syncClient = jiraClient;
    if (initialChangelogStrategy && connection.changelogStrategy == null) {
      void persistChangelogStrategy(db, connection, initialChangelogStrategy);
    }
    await ensureJiraServerCapabilities(db, jiraClient, connection, syncRunId);

    const boardId = Number(scope.boardId);
    const { detail: boardDetail, filterId: boardFilterId } = await getBoardDetailWithFilterId(
      jiraClient,
      boardId,
    );
    await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);

    // Abort early if the board layout has drifted away from the scope's configured statuses.
    // Continuing would produce incorrect lifecycle data (startedAt/completedAt derivation
    // depends on startStatusIds/doneStatusIds matching real board statuses).
    const drift = detectBoardDrift(scope, boardDetail);
    if (drift) {
      await applyBoardDriftHandling(db, scope, drift);
      const canceled = await finalizeRunningSyncRun(db, syncRunId, {
        status: 'canceled',
        finishedAt: new Date(),
        errorCode: 'BOARD_DRIFT_DETECTED',
      });
      if (!canceled) {
        return;
      }
      await cleanupStagedWorkItems(db, syncRunId);
      logger.info('Scope sync canceled due to board drift', { syncRunId, scopeId: scope.id });
      recordSyncMetric('canceled', 'BOARD_DRIFT_DETECTED');
      return;
    }

    const hostedCaps = getHostedSyncCaps();
    if (hostedCaps) {
      const boardIssueCount = await fetchBoardIssues(jiraClient, boardId, {
        maxResults: 1,
        fields: SYNC_ISSUE_FIELDS,
        expandChangelog: true,
      });
      if (boardIssueCount.total > hostedCaps.maxActiveIssues) {
        throw new SyncError(
          'HOSTED_ACTIVE_ISSUE_CAP_EXCEEDED',
          `Hosted beta allows at most ${hostedCaps.maxActiveIssues} active board issues per scope; Jira returned ${boardIssueCount.total}.`,
        );
      }
    }
    await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);

    // Build inverted status → column lookup from board configuration.
    const statusIdsByColumn: Record<string, string> = {};
    const startStatusIds = new Set<string>(scope.startStatusIds);
    const doneStatusIds = new Set<string>(scope.doneStatusIds);
    const inScopeStatusIds = new Set<string>(doneStatusIds);
    let reachedStartColumn = false;
    for (const col of boardDetail.columns) {
      for (const statusId of col.statusIds) {
        statusIdsByColumn[statusId] = col.name;
        if (!reachedStartColumn && startStatusIds.has(statusId)) {
          reachedStartColumn = true;
        }
        if (reachedStartColumn) {
          inScopeStatusIds.add(statusId);
        }
      }
    }

    // Create the BoardSnapshot upfront; projectRefs are backfilled after streaming.
    const snapshot = await db.boardSnapshot.create({
      data: {
        scopeId: scope.id,
        syncRunId,
        fetchedAt: new Date(),
        columns: boardDetail.columns,
        statusIdsByColumn,
        workflowStatuses: boardDetail.workflowStatuses ?? boardDetail.completionStatuses ?? boardDetail.statuses,
        projectRefs: [],
      },
    });
    await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);

    const ctx: SyncNormalizeContext = {
      scopeId: scope.id,
      syncRunId,
      connectionId: connection.id,
      leaseToken,
      cacheMaxAgeMs: getConfig().SYNC_FULL_RESYNC_HOURS * 3_600_000,
      startStatusIds,
      doneStatusIds,
      inScopeStatusIds,
      includedIssueTypeIds: new Set(scope.includedIssueTypeIds),
      statusIdsByColumn,
      jiraBaseUrl: connection.baseUrl,
    };

    // Stream and process issues in fixed-size batches to bound memory and exploit
    // parallelism in detail loading; HTTP uses the shared connection limiter.
    let batch: RawJiraIssue[] = [];
    const projectIdsSet = new Set<string>();
    const checkpointItems = await db.syncWorkItemStage.findMany({
      where: { syncRunId }, select: { jiraIssueId: true, projectId: true, jiraUpdatedAt: true },
    });
    const checkpoints = new Map(checkpointItems.map((item) => [item.jiraIssueId, item]));
    const processedIssueIds = new Set<string>();
    // A durable stage is reusable only after this attempt observes current membership
    // and confirms Jira's update timestamp. Missing timestamps require reprocessing.
    const shouldProcessIssue = (issue: RawJiraIssue) => {
      if (processedIssueIds.has(issue.id)) return false;
      processedIssueIds.add(issue.id);
      const staged = checkpoints.get(issue.id);
      if (issue.fields.updated && staged?.jiraUpdatedAt?.getTime() === Date.parse(issue.fields.updated)) {
        projectIdsSet.add(staged.projectId);
        jiraClient.stats.issuesSkipped++;
        return false;
      }
      return true;
    };

    for await (const issue of streamBoardIssues(jiraClient, boardId, {
      fields: SYNC_ISSUE_FIELDS,
      expandChangelog: true,
    })) {
      if (!shouldProcessIssue(issue)) continue;
      batch.push(issue);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
        await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
      await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
      batch = [];
    }

    const holdDefinition = await getActiveHoldDefinition(db, scope.id);
    const holdStatusIds = holdDefinition?.holdStatusIds ?? [];
    if (holdStatusIds.length > 0) {
      if (boardFilterId != null) {
        const holdJql =
          `filter = ${boardFilterId} AND status in (${jqlList(holdStatusIds)})`;

        if (hostedCaps) {
          const holdIssueCount = await fetchJqlIssueCount(jiraClient, holdJql);
          if (holdIssueCount > hostedCaps.maxActiveIssues) {
            throw new SyncError(
              'HOSTED_ACTIVE_ISSUE_CAP_EXCEEDED',
              `Hosted beta allows at most ${hostedCaps.maxActiveIssues} active board issues per scope; Jira returned ${holdIssueCount} configured hold issues.`,
            );
          }
          await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
        }

        for await (const issue of streamJqlIssues(jiraClient, holdJql, {
          fields: SYNC_ISSUE_FIELDS,
          expandChangelog: true,
        })) {
          if (!shouldProcessIssue(issue)) continue;
          batch.push(issue);
          if (batch.length >= BATCH_SIZE) {
            await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
            await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
            batch = [];
          }
        }
        if (batch.length > 0) {
          await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
          await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
          batch = [];
        }

        logger.info('Hold-issue sync pass finished', { syncRunId, scopeId: scope.id });
      } else {
        logger.warn('Board has no saved filter; skipping hold-issue sync pass', {
          syncRunId,
          boardId,
        });
      }
    }

    // Fetch historically-completed issues that match the board's saved filter but are
    // no longer visible on the board (because done statuses are not mapped to columns).
    // The board endpoint only returns issues whose status is mapped to a column, so
    // without this second pass the aging threshold model has no completed samples.
    if (scope.doneStatusIds.length > 0) {
      if (boardFilterId != null) {
        const doneIdList = scope.doneStatusIds.map((id: string) => `"${id}"`).join(', ');
        const completedJql =
          `filter = ${boardFilterId} AND status in (${doneIdList}) ` +
          `AND updated >= -${DEFAULT_COMPLETED_WINDOW_DAYS}d`;

        if (hostedCaps) {
          const completedIssueCount = await fetchJqlIssueCount(jiraClient, completedJql);
          if (completedIssueCount > hostedCaps.maxCompletedIssues) {
            throw new SyncError(
              'HOSTED_COMPLETED_ISSUE_CAP_EXCEEDED',
              `Hosted beta allows at most ${hostedCaps.maxCompletedIssues} completed issues per sync; Jira returned ${completedIssueCount}.`,
            );
          }
          await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
        }

        for await (const issue of streamJqlIssues(jiraClient, completedJql, {
          fields: SYNC_ISSUE_FIELDS,
          expandChangelog: true,
        })) {
          if (!shouldProcessIssue(issue)) continue;
          batch.push(issue);
          if (batch.length >= BATCH_SIZE) {
            await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
            await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
            batch = [];
          }
        }
        if (batch.length > 0) {
          await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
          await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);
        }

        logger.info('Completed-issue sync pass finished', { syncRunId, scopeId: scope.id });
      } else {
        logger.warn('Board has no saved filter; skipping completed-issue sync pass', {
          syncRunId,
          boardId,
        });
      }
    }

    // Backfill BoardSnapshot with project refs collected from issue data.
    await db.boardSnapshot.update({
      where: { id: snapshot.id },
      data: { projectRefs: Array.from(projectIdsSet).map((id) => ({ id })) },
    });
    await requireRunningSyncRun(db, syncRunId, claimedStartedAt, connection.id, leaseToken);

    // Use syncRunId as the dataVersion — it is already a UUID and unique per sync.
    const succeeded = await publishSyncedWorkItems(
      db,
      syncRunId,
      claimedStartedAt,
      scope.id,
      leaseToken,
      checkpointItems.filter((item) => !processedIssueIds.has(item.jiraIssueId)).map((item) => item.jiraIssueId),
    );
    if (!succeeded) {
      recordSyncMetric('skipped', 'SYNC_RUN_NOT_RUNNING', processedIssueIds.size);
      return;
    }

    const pressured = syncRun.errorCode === 'RATE_LIMITED' || jiraClient.stats.rateLimited > 0 || (jiraClient.lastRateState &&
      jiraClient.lastRateState.remaining <= jiraClient.lastRateState.limit * getConfig().JIRA_RATE_RESERVE_FRACTION);
    await db.flowScope.update({ where: { id: scope.id }, data: {
      permanentFailureCount: 0, lastSyncError: null,
      ...(fullResync ? { lastFullSyncAt: new Date() } : {}),
      nextSyncAt: new Date(Date.now() + scope.syncIntervalMinutes * 60_000 * (pressured ? 2 : 1) + Math.random() * 60_000),
    } });
    // Auxiliary reads run after the SyncRun has succeeded.
    lastHeartbeat = Infinity;
    await refreshEpicForecastTargetsAfterSync(db, jiraClient, {
      scopeId: scope.id,
      issueTypeIds: scope.includedIssueTypeIds,
      countableStatusIds: getCountableEpicStatusIds(
        boardDetail.columns,
        doneStatusIds,
      ),
    }).catch((refreshErr: unknown) => {
      logger.warn('Epic forecast target refresh failed after sync success', {
        syncRunId,
        scopeId: scope.id,
        error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
      });
    });

    // Rebuild projection data after the sync is marked as succeeded (non-blocking).
    await rebuildScopeProjections(db, scope.id, syncRunId).catch((rebuildErr: unknown) => {
      logger.warn('Projection rebuild failed after sync success', {
        syncRunId,
        scopeId: scope.id,
        error: rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr),
      });
    });

    // Mark connection healthy now that Jira was reachable and the sync succeeded.
    await updateConnectionHealthAfterSync(db, scope.workspaceId, scope.connectionId, {
      succeeded: true,
    }).catch((healthErr: unknown) => {
      logger.warn('Failed to update connection health after sync success', {
        connectionId: scope.connectionId,
        error: healthErr instanceof Error ? healthErr.message : String(healthErr),
      });
    });

    logger.info('Scope sync succeeded', {
      syncRunId,
      scopeId: scope.id,
      projectCount: projectIdsSet.size,
    });
    recordSyncMetric('succeeded', undefined, processedIssueIds.size);
  } catch (err) {
    if (leaseClaimed && scopeConnectionId && !await renewConnectionSync(db, scopeConnectionId, syncRunId, leaseToken)) {
      logger.warn('Sync attempt lost its connection lease; preserving the replacement attempt', { syncRunId });
      return;
    }
    if (err instanceof JiraClientError && err.code === 'RATE_LIMITED') {
      await db.syncRun.updateMany({ where: { id: syncRunId, status: 'running' }, data: {
        status: 'queued', errorCode: 'RATE_LIMITED', errorSummary: err.message,
        resumeAfter: new Date(Math.max(Date.now() + 60_000, syncClient?.lastRateState?.blockedUntil ?? 0)),
      } });
      logger.info('Scope sync paused; staged batches retained', { syncRunId, scopeId: syncRun.scopeId, errorCode: 'RATE_LIMITED' });
      recordSyncMetric('paused', 'RATE_LIMITED');
      return;
    }
    if (err instanceof JiraClientError && (err.statusCode === 403 || err.statusCode === 404)) {
      const failedScope = await db.flowScope.update({ where: { id: syncRun.scopeId }, data: {
        permanentFailureCount: { increment: 1 }, lastSyncError: err.message.slice(0, 500),
      } });
      await db.flowScope.update({ where: { id: syncRun.scopeId }, data: {
        nextSyncAt: new Date(Date.now() + Math.min(1440, 15 * 2 ** (failedScope.permanentFailureCount - 1)) * 60_000),
        ...(failedScope.permanentFailureCount >= getConfig().SYNC_PERMANENT_FAILURE_LIMIT ? { status: 'needs_attention' } : {}),
      } });
    }
    // Map errors to deterministic codes so the health updater can classify failures.
    let errorCode: string;
    let errorSummary: string;

    if (err instanceof SyncError) {
      errorCode = err.code;
      errorSummary = err.message.slice(0, 500);
    } else if (err instanceof JiraClientError) {
      // 401/403 → auth failure; all other HTTP errors → generic transport failure.
      errorCode =
        err.code === 'unauthorized' || err.code === 'forbidden'
          ? 'JIRA_AUTH_ERROR'
          : 'JIRA_HTTP_ERROR';
      errorSummary = err.message.slice(0, 500);
    } else {
      errorCode = 'UNEXPECTED_ERROR';
      errorSummary = err instanceof Error ? err.message.slice(0, 500) : String(err);
    }

    try {
      const finalized = await finalizeRunningSyncRun(db, syncRunId, {
        status: 'failed',
        finishedAt: new Date(),
        errorCode,
        errorSummary,
      });
      if (!finalized) {
        await cleanupStagedWorkItems(db, syncRunId);
        return;
      }
      await cleanupStagedWorkItems(db, syncRunId);
    } catch (updateErr: unknown) {
      logger.error('Failed to update SyncRun to failed state', {
        syncRunId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    // Update connection health only when we have context and the failure was Jira-related.
    if (scopeWorkspaceId && scopeConnectionId) {
      await updateConnectionHealthAfterSync(db, scopeWorkspaceId, scopeConnectionId, {
        succeeded: false,
        errorCode,
      }).catch((healthErr: unknown) => {
        logger.warn('Failed to update connection health after sync failure', {
          connectionId: scopeConnectionId,
          error: healthErr instanceof Error ? healthErr.message : String(healthErr),
        });
      });
    }

    logger.error('Scope sync failed', { syncRunId, errorCode, errorSummary });
    recordSyncMetric('failed', errorCode);
    throw err;
  } finally {
    if (syncClient && scopeConnectionId) {
      logger.info('Jira sync request summary', { syncRunId, scopeId: syncRun.scopeId, connectionId: scopeConnectionId, ...syncClient.stats });
      const day = new Date(new Date().toISOString().slice(0, 10));
      await db.jiraRequestDay.upsert({
        where: { connectionId_scopeId_day: { connectionId: scopeConnectionId, scopeId: syncRun.scopeId, day } },
        create: { connectionId: scopeConnectionId, scopeId: syncRun.scopeId, day, requests: syncClient.stats.requests, rateLimited: syncClient.stats.rateLimited },
        update: { requests: { increment: syncClient.stats.requests }, rateLimited: { increment: syncClient.stats.rateLimited } },
      }).catch((error: unknown) => logger.warn('Could not persist Jira request summary', { syncRunId, error: String(error) }));
    }
    if (leaseClaimed && scopeConnectionId) await releaseConnectionSync(db, scopeConnectionId, syncRunId, leaseToken);
  }
}

function getHostedSyncCaps(): { maxActiveIssues: number; maxCompletedIssues: number } | null {
  const config = getConfig();
  if (!isHostedMode(config)) {
    return null;
  }

  return {
    maxActiveIssues: config.HOSTED_BETA_MAX_ACTIVE_ISSUES_PER_SCOPE,
    maxCompletedIssues: config.HOSTED_BETA_MAX_COMPLETED_ISSUES_PER_SYNC,
  };
}

async function resolveJiraAccessToken(
  db: PrismaClient,
  connection: {
    id: string;
    workspaceId: string;
    authType: string;
    encryptedSecretRef: string | null;
    accessTokenSecretRef: string | null;
    refreshTokenSecretRef: string | null;
    accessTokenExpiresAt: Date | null;
  },
): Promise<string> {
  const config = getConfig();
  if (connection.authType !== 'cloud_oauth_3lo') {
    if (!connection.encryptedSecretRef) {
      throw new SyncError('JIRA_SECRET_MISSING', 'Data Center Jira connection is missing its encrypted PAT ref');
    }
    return decryptSecret(connection.encryptedSecretRef, config.ENCRYPTION_KEY);
  }

  if (!connection.accessTokenSecretRef || !connection.refreshTokenSecretRef) {
    throw new SyncError('JIRA_OAUTH_TOKEN_MISSING', 'Jira Cloud OAuth connection is missing encrypted token refs');
  }

  if (
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - Date.now() > 2 * 60 * 1000
  ) {
    return decryptSecret(connection.accessTokenSecretRef, config.ENCRYPTION_KEY);
  }

  try {
    const refreshed = await refreshAtlassianOAuthToken({
      clientId: requireHostedConfig('ATLASSIAN_CLIENT_ID'),
      clientSecret: requireHostedConfig('ATLASSIAN_CLIENT_SECRET'),
      refreshToken: decryptSecret(connection.refreshTokenSecretRef, config.ENCRYPTION_KEY),
    });

    await db.jiraConnection.update({
      where: { workspaceId_id: { workspaceId: connection.workspaceId, id: connection.id } },
      data: {
        accessTokenSecretRef: encryptSecret(refreshed.accessToken, config.ENCRYPTION_KEY),
        refreshTokenSecretRef: encryptSecret(refreshed.refreshToken, config.ENCRYPTION_KEY),
        accessTokenExpiresAt: refreshed.expiresAt,
        oauthScopes: refreshed.scopes,
        healthStatus: 'healthy',
        lastHealthyAt: new Date(),
        lastErrorCode: null,
      },
    });

    return refreshed.accessToken;
  } catch (err) {
    await db.jiraConnection.update({
      where: { workspaceId_id: { workspaceId: connection.workspaceId, id: connection.id } },
      data: {
        healthStatus: 'unhealthy',
        lastErrorCode: 'ATLASSIAN_TOKEN_REFRESH_FAILED',
      },
    }).catch(() => undefined);
    throw new SyncError(
      'ATLASSIAN_TOKEN_REFRESH_FAILED',
      err instanceof Error ? err.message : 'Failed to refresh Atlassian OAuth token',
    );
  }
}

function requireHostedConfig(key: 'ATLASSIAN_CLIENT_ID' | 'ATLASSIAN_CLIENT_SECRET'): string {
  const value = getConfig()[key];
  if (!value) {
    throw new SyncError('HOSTED_CONFIG_MISSING', `${key} is required for Jira Cloud OAuth sync`);
  }
  return value;
}

function getInitialChangelogFetchStrategy(
  connection: JiraConnectionCapabilityFields,
): JiraChangelogFetchStrategy | undefined {
  return (
    normalizeChangelogFetchStrategy(connection.changelogStrategy) ??
    (connection.jiraVersion && connection.jiraDeploymentType
      ? inferChangelogFetchStrategyFromServerInfo({
          version: connection.jiraVersion,
          deploymentType: connection.jiraDeploymentType,
        })
      : undefined)
  );
}

async function persistChangelogStrategy(
  db: PrismaClient,
  connection: JiraConnectionCapabilityFields,
  strategy: JiraChangelogFetchStrategy,
): Promise<void> {
  await updateJiraConnectionCapabilities(db, connection.workspaceId, connection.id, {
    changelogStrategy: strategy,
    capabilitiesDetectedAt: new Date(),
  }).catch((err: unknown) => {
    logger.warn('Failed to persist Jira changelog capability', {
      connectionId: connection.id,
      strategy,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function ensureJiraServerCapabilities(
  db: PrismaClient,
  jiraClient: JiraClient,
  connection: JiraConnectionCapabilityFields,
  syncRunId: string,
): Promise<void> {
  if (connection.jiraVersion && connection.jiraDeploymentType) {
    return;
  }

  try {
    const serverInfo = await jiraClient.fetchServerInfo();
    const changelogStrategy = inferChangelogFetchStrategyFromServerInfo(serverInfo);
    if (changelogStrategy) {
      jiraClient.setChangelogFetchStrategy(changelogStrategy);
    }

    await updateJiraConnectionCapabilities(db, connection.workspaceId, connection.id, {
      jiraVersion: serverInfo.version,
      jiraDeploymentType: serverInfo.deploymentType,
      ...(changelogStrategy !== undefined ? { changelogStrategy } : {}),
      capabilitiesDetectedAt: new Date(),
    });
  } catch (err) {
    if (err instanceof JiraClientError && err.code === 'RATE_LIMITED') throw err;
    logger.warn('Failed to detect Jira server capabilities before sync; continuing with runtime probing', {
      syncRunId,
      connectionId: connection.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function refreshEpicForecastTargetsAfterSync(
  db: PrismaClient,
  jiraClient: JiraClient,
  input: {
    scopeId: string;
    issueTypeIds: string[];
    countableStatusIds: string[];
  },
): Promise<void> {
  const targets = await listEpicForecastTargets(db, input.scopeId);
  const epicLinkTargets = targets.filter(
    (target) => target.status === 'active' && target.storyCountSource === 'epic_link',
  );
  if (epicLinkTargets.length === 0) {
    return;
  }

  const snapshotsByIssueKey = new Map<string, { remainingStoryCount: number; issueKeys: string[] }>();
  await Promise.all(
    epicLinkTargets.map(async (target) => {
      const jql = buildEpicRemainingStoriesJql(
        target.jiraIssueKey,
        input.issueTypeIds,
        input.countableStatusIds,
      );
      const issueKeys: string[] = [];
      if (jql) {
        for await (const issue of streamJqlIssues(jiraClient, jql, { fields: 'summary' })) {
          issueKeys.push(issue.key);
        }
      }
      snapshotsByIssueKey.set(target.jiraIssueKey, {
        remainingStoryCount: issueKeys.length,
        issueKeys,
      });
    }),
  );

  const updatedCount = await refreshEpicLinkForecastTargetCounts(
    db,
    input.scopeId,
    snapshotsByIssueKey,
  );
  logger.info('Epic forecast targets refreshed after sync', {
    scopeId: input.scopeId,
    targetCount: updatedCount,
  });
}

/**
 * Reuse complete issue details and durably stage a normalized batch.
 * HTTP requests share the connection limiter across scopes and worker processes.
 */
async function processBatch(
  db: PrismaClient,
  jiraClient: JiraClient,
  issues: RawJiraIssue[],
  ctx: SyncNormalizeContext,
  projectIdsSet: Set<string>,
): Promise<void> {
  // Finish all in-flight work before releasing a connection lease on failure.
  const results = await Promise.allSettled(issues.map(async (issue) => {
    const { changelog, latestComment } = await loadIssueDetails(db, jiraClient, ctx.connectionId, issue, ctx.cacheMaxAgeMs, ctx.leaseToken);
    const normalized = normalizeJiraIssue(issue, changelog, ctx, latestComment);
    projectIdsSet.add(normalized.projectId);
    return normalized;
  }));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  const normalizedItems = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);

  await stageWorkItems(db, ctx, normalizedItems);
  await db.syncRunCheckpoint.upsert({ where: { syncRunId: ctx.syncRunId },
    create: { syncRunId: ctx.syncRunId, phase: 'fetch', counts: { ...jiraClient.stats } },
    update: { phase: 'fetch', counts: { ...jiraClient.stats } },
  });
}

/**
 * JSONB staging representation of lifecycle events. Runtime normalization uses
 * Date instances, but staged rows serialize timestamps so Prisma can persist
 * them in the SyncWorkItemStage.lifecycleEvents JSON column.
 */
type StagedLifecycleEvent = Omit<NormalizedWorkItem['lifecycleEvents'][number], 'changedAt'> & {
  changedAt: string;
};

const LIFECYCLE_EVENT_TYPE_MAP: Record<StagedLifecycleEvent['eventType'], true> = {
  status_change: true,
  field_change: true,
  reopened: true,
  completed: true,
};
const LIFECYCLE_EVENT_TYPES = new Set<StagedLifecycleEvent['eventType']>(
  Object.keys(LIFECYCLE_EVENT_TYPE_MAP) as StagedLifecycleEvent['eventType'][],
);

function stageLifecycleEvents(
  events: NormalizedWorkItem['lifecycleEvents'],
): StagedLifecycleEvent[] {
  return events.map((event) => ({
    ...event,
    changedAt: event.changedAt.toISOString(),
  }));
}

function restoreLifecycleEvents(
  value: unknown,
  syncRunId: string,
  jiraIssueId: string,
): NormalizedWorkItem['lifecycleEvents'] {
  if (!Array.isArray(value)) {
    logger.warn('Ignoring invalid staged lifecycle events payload', { syncRunId, jiraIssueId });
    return [];
  }

  const restoredEvents: NormalizedWorkItem['lifecycleEvents'] = [];
  for (const event of value) {
    if (!isStagedLifecycleEvent(event)) {
      logger.warn('Ignoring malformed staged lifecycle event', {
        syncRunId,
        jiraIssueId,
        eventType: getStagedEventType(event),
      });
      continue;
    }
    restoredEvents.push({
      ...event,
      changedAt: new Date(event.changedAt),
    });
  }

  return restoredEvents;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function getStagedEventType(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('eventType' in value)) {
    return undefined;
  }

  const eventType = (value as { eventType?: unknown }).eventType;
  if (
    typeof eventType === 'string' ||
    typeof eventType === 'number' ||
    typeof eventType === 'boolean'
  ) {
    return String(eventType);
  }
  return undefined;
}

function isStagedLifecycleEvent(value: unknown): value is StagedLifecycleEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const event = value as Partial<StagedLifecycleEvent>;
  return (
    typeof event.rawChangelogId === 'string' &&
    event.eventType !== undefined &&
    LIFECYCLE_EVENT_TYPES.has(event.eventType) &&
    isNullableString(event.fromStatusId) &&
    isNullableString(event.toStatusId) &&
    isNullableString(event.changedFieldId) &&
    typeof event.changedAt === 'string' &&
    !Number.isNaN(Date.parse(event.changedAt))
  );
}

async function lockSyncAttempt(db: Pick<PrismaClient, '$queryRaw'>, syncRunId: string, leaseToken: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT run.id
    FROM "SyncRun" run
    JOIN "FlowScope" scope ON scope.id = run."scopeId"
    JOIN "JiraConnection" connection ON connection.id = scope."connectionId"
    WHERE run.id = ${syncRunId} AND run.status = 'running'
      AND connection."activeSyncRunId" = ${syncRunId} AND connection."activeSyncLeaseToken" = ${leaseToken} AND connection."syncLeaseUntil" > NOW()
    FOR UPDATE OF run, connection
  `;
  return rows.length > 0;
}

async function stageWorkItems(
  db: PrismaClient,
  ctx: SyncNormalizeContext,
  items: NormalizedWorkItem[],
): Promise<void> {
  const { scopeId, syncRunId, leaseToken } = ctx;
  if (items.length === 0) {
    return;
  }

  await db.$transaction(async (tx) => {
    if (!await lockSyncAttempt(tx, syncRunId, leaseToken)) {
      throw new SyncError('SYNC_LEASE_LOST', 'Connection lease is no longer owned by this attempt');
    }
    // Replace changed stages atomically; failed detail loads never erase a checkpoint.
    await tx.syncWorkItemStage.deleteMany({ where: { syncRunId, jiraIssueId: { in: items.map((item) => item.jiraIssueId) } } });
    await tx.syncWorkItemStage.createMany({
      data: items.map((item) => ({
        syncRunId,
        scopeId,
        jiraIssueId: item.jiraIssueId,
        issueKey: item.issueKey,
        summary: item.summary,
        issueTypeId: item.issueTypeId,
        issueTypeName: item.issueTypeName,
        projectId: item.projectId,
        currentStatusId: item.currentStatusId,
        currentStatusName: item.currentStatusName,
        currentColumn: item.currentColumn,
        assigneeName: item.assigneeName,
        jiraCreatedAt: item.createdAt,
        jiraUpdatedAt: item.jiraUpdatedAt,
        latestCommentAuthor: item.latestCommentAuthor,
        latestCommentBody: item.latestCommentBody,
        latestCommentCreatedAt: item.latestCommentCreatedAt,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        reopenedCount: item.reopenedCount,
        directUrl: item.directUrl,
        excludedReason: item.excludedReason,
        lifecycleEvents: stageLifecycleEvents(item.lifecycleEvents),
      })),
      skipDuplicates: true,
    });
  });
}

async function publishSyncedWorkItems(
  db: PrismaClient,
  syncRunId: string,
  startedAt: Date,
  scopeId: string,
  leaseToken: string,
  departedIssueIds: string[],
): Promise<boolean> {
  const {
    SYNC_PUBLISH_TRANSACTION_TIMEOUT_MS: publishTimeoutMs,
    SYNC_PUBLISH_TRANSACTION_MAX_WAIT_MS: publishMaxWaitMs,
  } = getConfig();
  // The publish transaction is intentionally atomic: Flow analytics queries pin
  // to the last succeeded SyncRun's dataVersion (= syncRunId), so the previous
  // version remains fully visible until this transaction commits. Prisma's
  // default 5 s interactive transaction timeout is not enough for large boards,
  // so we raise it via config. The runtime is still bounded by the finite set
  // of staged items.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    const ownsAttempt = await lockSyncAttempt(tx, syncRunId, leaseToken);
    if (!ownsAttempt) {
      logger.warn('SyncRun left running state before publish; skipping', {
        syncRunId,
      });
      return false;
    }
    await tx.$executeRaw`
      UPDATE "SyncRun"
      SET "startedAt" = ${startedAt}, "updatedAt" = NOW()
      WHERE id = ${syncRunId}
        AND status = 'running'
    `;

    // Prune only after all membership scans finish, inside the fenced publication.
    for (let offset = 0; offset < departedIssueIds.length; offset += STAGED_ITEM_PAGE_SIZE) {
      await tx.syncWorkItemStage.deleteMany({ where: { syncRunId,
        jiraIssueId: { in: departedIssueIds.slice(offset, offset + STAGED_ITEM_PAGE_SIZE) },
      } });
    }
    const syncedAt = new Date();
    let lastStageId: string | undefined;

    for (;;) {
      const stagedItems = await tx.syncWorkItemStage.findMany({
        where: { syncRunId },
        orderBy: { id: 'asc' },
        take: STAGED_ITEM_PAGE_SIZE,
        ...(lastStageId ? { cursor: { id: lastStageId }, skip: 1 } : {}),
      });

      if (stagedItems.length === 0) {
        break;
      }

      for (const item of stagedItems) {
        const workItem = await tx.workItem.upsert({
          where: { scopeId_jiraIssueId: { scopeId, jiraIssueId: item.jiraIssueId } },
          create: {
            scopeId,
            jiraIssueId: item.jiraIssueId,
            issueKey: item.issueKey,
            summary: item.summary,
            issueTypeId: item.issueTypeId,
            issueTypeName: item.issueTypeName,
            projectId: item.projectId,
            currentStatusId: item.currentStatusId,
            currentStatusName: item.currentStatusName,
            currentColumn: item.currentColumn,
            assigneeName: item.assigneeName,
            createdAt: item.jiraCreatedAt,
            jiraUpdatedAt: item.jiraUpdatedAt,
            latestCommentAuthor: item.latestCommentAuthor,
            latestCommentBody: item.latestCommentBody,
            latestCommentCreatedAt: item.latestCommentCreatedAt,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            reopenedCount: item.reopenedCount,
            directUrl: item.directUrl,
            excludedReason: item.excludedReason,
            syncedAt,
            lastSyncRunId: syncRunId,
          },
          update: {
            issueKey: item.issueKey,
            summary: item.summary,
            issueTypeId: item.issueTypeId,
            issueTypeName: item.issueTypeName,
            projectId: item.projectId,
            currentStatusId: item.currentStatusId,
            currentStatusName: item.currentStatusName,
            currentColumn: item.currentColumn,
            assigneeName: item.assigneeName,
            jiraUpdatedAt: item.jiraUpdatedAt,
            latestCommentAuthor: item.latestCommentAuthor,
            latestCommentBody: item.latestCommentBody,
            latestCommentCreatedAt: item.latestCommentCreatedAt,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            reopenedCount: item.reopenedCount,
            directUrl: item.directUrl,
            excludedReason: item.excludedReason,
            syncedAt,
            lastSyncRunId: syncRunId,
          },
        });

        const restoredLifecycleEvents = restoreLifecycleEvents(
          item.lifecycleEvents,
          syncRunId,
          item.jiraIssueId,
        );
        if (restoredLifecycleEvents.length > 0) {
          await tx.workItemLifecycleEvent.createMany({
            data: restoredLifecycleEvents.map((event) => ({
              workItemId: workItem.id,
              rawChangelogId: event.rawChangelogId,
              eventType: event.eventType,
              fromStatusId: event.fromStatusId,
              toStatusId: event.toStatusId,
              changedFieldId: event.changedFieldId,
              changedAt: event.changedAt,
            })),
            skipDuplicates: true,
          });
        }
      }

      lastStageId = stagedItems.at(-1)?.id;
    }

    await tx.syncWorkItemStage.deleteMany({ where: { syncRunId } });

    await tx.syncRun.updateMany({
      where: { id: syncRunId, status: 'running' },
      data: {
        status: 'succeeded',
        errorCode: null, errorSummary: null, resumeAfter: null,
        finishedAt: new Date(),
        dataVersion: syncRunId,
      },
    });

    return true;
  }, { timeout: publishTimeoutMs, maxWait: publishMaxWaitMs });
}
