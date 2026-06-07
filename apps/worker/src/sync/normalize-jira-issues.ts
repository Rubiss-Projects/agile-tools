import type { RawJiraIssue, ChangelogHistory, JiraComment } from '@agile-tools/jira-client';

export interface NormalizeContext {
  scopeId: string;
  syncRunId: string;
  startStatusIds: Set<string>;
  doneStatusIds: Set<string>;
  inScopeStatusIds: Set<string>;
  includedIssueTypeIds: Set<string>;
  /** Inverted lookup: statusId → column name from the board configuration. */
  statusIdsByColumn: Record<string, string>;
  jiraBaseUrl: string;
}

export interface NormalizedLifecycleEvent {
  rawChangelogId: string;
  eventType: 'status_change' | 'field_change' | 'reopened' | 'completed';
  fromStatusId: string | null;
  toStatusId: string | null;
  changedFieldId: string | null;
  changedAt: Date;
}

export interface NormalizedWorkItem {
  jiraIssueId: string;
  issueKey: string;
  summary: string;
  issueTypeId: string;
  issueTypeName: string;
  projectId: string;
  currentStatusId: string;
  currentStatusName: string;
  currentColumn: string | null;
  assigneeName: string | null;
  createdAt: Date;
  jiraUpdatedAt: Date | null;
  latestCommentAuthor: string | null;
  latestCommentBody: string | null;
  latestCommentCreatedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  reopenedCount: number;
  directUrl: string;
  /** Set to 'issue_type_excluded' if not in includedIssueTypeIds; null otherwise. */
  excludedReason: string | null;
  lifecycleEvents: NormalizedLifecycleEvent[];
}

export function normalizeJiraIssue(
  issue: RawJiraIssue,
  changelog: ChangelogHistory[],
  ctx: NormalizeContext,
  latestJiraComment?: JiraComment | null,
): NormalizedWorkItem {
  const { fields } = issue;
  const currentStatusId = fields.status.id;
  const assigneeName = fields.assignee?.name ?? fields.assignee?.accountId ?? null;

  const excludedReason = !ctx.includedIssueTypeIds.has(fields.issuetype.id)
    ? 'issue_type_excluded'
    : null;

  const lifecycleEvents = deriveLifecycleEvents(changelog, ctx);
  const createdAt = new Date(fields.created);
  const resolutionDate = parseOptionalDate(fields.resolutiondate);
  const latestComment = selectLatestComment(
    latestJiraComment ? [latestJiraComment] : (fields.comment?.comments ?? []),
  );
  const { startedAt, completedAt } = deriveTimestamps(
    lifecycleEvents,
    currentStatusId,
    createdAt,
    resolutionDate,
    ctx,
  );
  const reopenedCount = lifecycleEvents.filter((e) => e.eventType === 'reopened').length;

  return {
    jiraIssueId: issue.id,
    issueKey: issue.key,
    summary: fields.summary,
    issueTypeId: fields.issuetype.id,
    issueTypeName: fields.issuetype.name,
    projectId: fields.project.id,
    currentStatusId,
    currentStatusName: fields.status.name,
    currentColumn: ctx.statusIdsByColumn[currentStatusId] ?? null,
    assigneeName,
    createdAt,
    jiraUpdatedAt: fields.updated ? new Date(fields.updated) : null,
    latestCommentAuthor: latestComment?.author ?? null,
    latestCommentBody: latestComment?.body ?? null,
    latestCommentCreatedAt: latestComment?.createdAt ?? null,
    startedAt,
    completedAt,
    reopenedCount,
    directUrl: `${ctx.jiraBaseUrl}/browse/${issue.key}`,
    excludedReason,
    lifecycleEvents,
  };
}

function selectLatestComment(
  comments: NonNullable<RawJiraIssue['fields']['comment']>['comments'],
): { author: string | null; body: string; createdAt: Date } | null {
  if (!comments || comments.length === 0) {
    return null;
  }

  const validComments = comments
    .map((comment) => {
      const createdAt = comment.created ? new Date(comment.created) : null;
      if (!comment.body || !createdAt || Number.isNaN(createdAt.getTime())) {
        return null;
      }

      return {
        author:
          comment.author?.displayName ??
          comment.author?.name ??
          comment.author?.accountId ??
          null,
        body: comment.body,
        createdAt,
      };
    })
    .filter((comment): comment is { author: string | null; body: string; createdAt: Date } =>
      comment !== null,
    );

  if (validComments.length === 0) {
    return null;
  }

  return validComments.reduce((latest, comment) =>
    comment.createdAt.getTime() > latest.createdAt.getTime() ? comment : latest,
  );
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Derive lifecycle events from Jira changelog histories.
 *
 * Rules:
 * - Each status field change produces a `status_change` event.
 * - Entering a done status (not from another done status) also produces a `completed` event.
 * - Leaving a done status (to a non-done status) also produces a `reopened` event.
 * - At most one `field_change` event is emitted per history entry due to the DB unique
 *   constraint on (workItemId, rawChangelogId, eventType). Only the first non-status field
 *   with a fieldId is recorded.
 */
function deriveLifecycleEvents(
  histories: ChangelogHistory[],
  ctx: NormalizeContext,
): NormalizedLifecycleEvent[] {
  const events: NormalizedLifecycleEvent[] = [];

  const sorted = [...histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  for (const history of sorted) {
    const changedAt = new Date(history.created);
    let fieldChangeEmitted = false;

    for (const item of history.items) {
      if (item.field === 'status') {
        const fromId = item.from ?? null;
        const toId = item.to ?? null;

        events.push({
          rawChangelogId: history.id,
          eventType: 'status_change',
          fromStatusId: fromId,
          toStatusId: toId,
          changedFieldId: null,
          changedAt,
        });

        const enteringDone = toId != null && ctx.doneStatusIds.has(toId);
        const leavingDone = fromId != null && ctx.doneStatusIds.has(fromId);

        if (enteringDone && !leavingDone) {
          events.push({
            rawChangelogId: history.id,
            eventType: 'completed',
            fromStatusId: fromId,
            toStatusId: toId,
            changedFieldId: null,
            changedAt,
          });
        } else if (leavingDone && !enteringDone) {
          events.push({
            rawChangelogId: history.id,
            eventType: 'reopened',
            fromStatusId: fromId,
            toStatusId: toId,
            changedFieldId: null,
            changedAt,
          });
        }
      } else if (!fieldChangeEmitted && item.fieldId != null) {
        // One field_change per history entry (DB unique constraint: workItemId, rawChangelogId, eventType)
        events.push({
          rawChangelogId: history.id,
          eventType: 'field_change',
          fromStatusId: null,
          toStatusId: null,
          changedFieldId: item.fieldId,
          changedAt,
        });
        fieldChangeEmitted = true;
      }
    }
  }

  return events;
}

/**
 * Derive startedAt and completedAt from lifecycle events.
 *
 * - startedAt: earliest transition into a startStatusId. If no such transition
 *   exists but the item's current status is already in scope (e.g., CSV-imported
 *   issues created directly in an in-flow status), fall back to the issue's
 *   createdAt so the item is still treated as in-flow by downstream projections.
 * - completedAt: timestamp of the latest `completed` event, but only when the
 *   item's current status is a done status (i.e., it has not been re-opened
 *   since its last completion). If no completion event exists, fall back to
 *   Jira's resolutiondate for imported or history-truncated done issues.
 */
function deriveTimestamps(
  events: NormalizedLifecycleEvent[],
  currentStatusId: string,
  createdAt: Date,
  resolutionDate: Date | null,
  ctx: NormalizeContext,
): { startedAt: Date | null; completedAt: Date | null } {
  const startEvents = events.filter(
    (e) =>
      e.eventType === 'status_change' &&
      e.toStatusId != null &&
      ctx.startStatusIds.has(e.toStatusId),
  );
  const currentStatusInScope = ctx.inScopeStatusIds.has(currentStatusId);
  let startedAt: Date | null = null;
  if (currentStatusInScope) {
    if (startEvents.length > 0) {
      startedAt = startEvents[0]!.changedAt;
    } else {
      startedAt = createdAt;
    }
  }

  let completedAt: Date | null = null;
  if (ctx.doneStatusIds.has(currentStatusId)) {
    const completedEvents = events.filter((e) => e.eventType === 'completed');
    if (completedEvents.length > 0) {
      completedAt = completedEvents[completedEvents.length - 1]!.changedAt;
    } else if (resolutionDate) {
      completedAt = resolutionDate;
    }
  }

  return { startedAt, completedAt };
}
