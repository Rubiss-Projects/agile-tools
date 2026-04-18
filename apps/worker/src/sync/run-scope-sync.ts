import type { PrismaClient } from '@agile-tools/db';
import { getConfig, decryptSecret, logger } from '@agile-tools/shared';
import type { JiraClient } from '@agile-tools/jira-client';
import {
  createJiraClient,
  getBoardDetail,
  streamBoardIssues,
  fetchIssueChangelog,
} from '@agile-tools/jira-client';
import type { RawJiraIssue } from '@agile-tools/jira-client';
import {
  normalizeJiraIssue,
  type NormalizeContext,
  type NormalizedWorkItem,
} from './normalize-jira-issues.js';

const BATCH_SIZE = 10;

class SyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/**
 * Execute the full Jira sync pipeline for a single scope.
 *
 * The caller is responsible for ensuring a SyncRun row exists in `queued` status.
 * This function atomically transitions the run to `running` via an updateMany guard,
 * and on completion updates it to `succeeded` or `failed`.
 */
export async function runScopeSync(db: PrismaClient, syncRunId: string): Promise<void> {
  const syncRun = await db.syncRun.findUnique({ where: { id: syncRunId } });
  if (!syncRun) {
    logger.error('SyncRun not found; skipping', { syncRunId });
    return;
  }

  // Atomically claim: only advance if still in queued state, preventing duplicate execution.
  const claimed = await db.syncRun.updateMany({
    where: { id: syncRunId, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (claimed.count === 0) {
    logger.warn('SyncRun is not in queued state; skipping', {
      syncRunId,
      currentStatus: syncRun.status,
    });
    return;
  }

  try {
    const scope = await db.flowScope.findUnique({ where: { id: syncRun.scopeId } });
    if (!scope) {
      throw new SyncError('SCOPE_NOT_FOUND', `FlowScope ${syncRun.scopeId} not found`);
    }

    if (scope.status !== 'active') {
      await db.syncRun.update({
        where: { id: syncRunId },
        data: { status: 'canceled', finishedAt: new Date(), errorCode: 'SCOPE_NOT_ACTIVE' },
      });
      logger.info('Scope sync canceled: scope is not active', {
        syncRunId,
        scopeId: scope.id,
        scopeStatus: scope.status,
      });
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

    const { ENCRYPTION_KEY } = getConfig();
    const pat = decryptSecret(connection.encryptedSecretRef, ENCRYPTION_KEY);
    const jiraClient = createJiraClient(connection.baseUrl, pat);

    const boardId = Number(scope.boardId);
    const boardDetail = await getBoardDetail(jiraClient, boardId);

    // Build inverted status → column lookup from board configuration.
    const statusIdsByColumn: Record<string, string> = {};
    for (const col of boardDetail.columns) {
      for (const statusId of col.statusIds) {
        statusIdsByColumn[statusId] = col.name;
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
        projectRefs: [],
      },
    });

    const ctx: NormalizeContext = {
      scopeId: scope.id,
      syncRunId,
      startStatusIds: new Set(scope.startStatusIds),
      doneStatusIds: new Set(scope.doneStatusIds),
      includedIssueTypeIds: new Set(scope.includedIssueTypeIds),
      statusIdsByColumn,
      jiraBaseUrl: connection.baseUrl,
    };

    // Stream and process issues in fixed-size batches to bound memory and exploit
    // parallelism in changelog fetching (the Jira client's internal pLimit throttles HTTP).
    let batch: RawJiraIssue[] = [];
    const projectIdsSet = new Set<string>();

    for await (const issue of streamBoardIssues(jiraClient, boardId)) {
      batch.push(issue);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await processBatch(db, jiraClient, batch, ctx, projectIdsSet);
    }

    // Backfill BoardSnapshot with project refs collected from issue data.
    await db.boardSnapshot.update({
      where: { id: snapshot.id },
      data: { projectRefs: Array.from(projectIdsSet).map((id) => ({ id })) },
    });

    // Use syncRunId as the dataVersion — it is already a UUID and unique per sync.
    await db.syncRun.update({
      where: { id: syncRunId },
      data: { status: 'succeeded', finishedAt: new Date(), dataVersion: syncRunId },
    });

    logger.info('Scope sync succeeded', {
      syncRunId,
      scopeId: scope.id,
      projectCount: projectIdsSet.size,
    });
  } catch (err) {
    const errorCode = err instanceof SyncError ? err.code : 'UNEXPECTED_ERROR';
    const errorSummary = err instanceof Error ? err.message.slice(0, 500) : String(err);

    await db.syncRun
      .update({
        where: { id: syncRunId },
        data: { status: 'failed', finishedAt: new Date(), errorCode, errorSummary },
      })
      .catch((updateErr: unknown) => {
        logger.error('Failed to update SyncRun to failed state', {
          syncRunId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      });

    logger.error('Scope sync failed', { syncRunId, errorCode, errorSummary });
    throw err;
  }
}

/**
 * Fetch changelogs for a batch of issues concurrently, normalize each, then upsert to DB.
 * Concurrency for HTTP is bounded by the Jira client's internal pLimit.
 */
async function processBatch(
  db: PrismaClient,
  jiraClient: JiraClient,
  issues: RawJiraIssue[],
  ctx: NormalizeContext,
  projectIdsSet: Set<string>,
): Promise<void> {
  const changelogs = await Promise.all(
    issues.map((issue) => fetchIssueChangelog(jiraClient, issue.id)),
  );

  await Promise.all(
    issues.map((issue, i) => {
      const normalized = normalizeJiraIssue(issue, changelogs[i]!, ctx);
      projectIdsSet.add(normalized.projectId);
      return upsertWorkItem(db, normalized, ctx);
    }),
  );
}

async function upsertWorkItem(
  db: PrismaClient,
  item: NormalizedWorkItem,
  ctx: NormalizeContext,
): Promise<void> {
  const workItem = await db.workItem.upsert({
    where: { scopeId_jiraIssueId: { scopeId: ctx.scopeId, jiraIssueId: item.jiraIssueId } },
    create: {
      scopeId: ctx.scopeId,
      jiraIssueId: item.jiraIssueId,
      issueKey: item.issueKey,
      summary: item.summary,
      issueTypeId: item.issueTypeId,
      projectId: item.projectId,
      currentStatusId: item.currentStatusId,
      currentColumn: item.currentColumn,
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      reopenedCount: item.reopenedCount,
      directUrl: item.directUrl,
      excludedReason: item.excludedReason,
      syncedAt: new Date(),
      lastSyncRunId: ctx.syncRunId,
    },
    update: {
      issueKey: item.issueKey,
      summary: item.summary,
      issueTypeId: item.issueTypeId,
      projectId: item.projectId,
      currentStatusId: item.currentStatusId,
      currentColumn: item.currentColumn,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      reopenedCount: item.reopenedCount,
      directUrl: item.directUrl,
      excludedReason: item.excludedReason,
      syncedAt: new Date(),
      lastSyncRunId: ctx.syncRunId,
    },
  });

  if (item.lifecycleEvents.length > 0) {
    await db.workItemLifecycleEvent.createMany({
      data: item.lifecycleEvents.map((event) => ({
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
