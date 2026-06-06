import { type NextRequest } from 'next/server';
import { getFlowScope, getPrismaClient } from '@agile-tools/db';
import { fetchJqlIssueCount, getBoardDetail, JiraClientError } from '@agile-tools/jira-client';
import type { BoardColumn } from '@agile-tools/shared/contracts/api';
import { logger } from '@agile-tools/shared';
import { requireWorkspaceContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { createClientForConnection, requireJiraConnection } from '../../../../admin/jira-connections/_lib';
import { withHttpMetrics } from '@/server/route-metrics';

interface JiraEpicIssue {
  key: string;
  fields: {
    summary?: string;
    duedate?: string | null;
    status?: { name?: string };
  };
}

function buildJiraIssueUrl(baseUrl: string, issueKey: string): string {
  return `${baseUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}`;
}

function normalizeIssueKey(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function quoteJqlValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function jqlList(values: string[]): string {
  return values.map(quoteJqlValue).join(', ');
}

function getCountableStatusIds(
  columns: BoardColumn[],
  startStatusIds: string[],
  doneStatusIds: string[],
): string[] {
  const startStatuses = new Set(startStatusIds);
  const doneStatuses = new Set(doneStatusIds);
  const statusIds: string[] = [];
  let reachedStartColumn = startStatuses.size === 0;

  for (const column of columns) {
    for (const statusId of column.statusIds) {
      if (!reachedStartColumn && startStatuses.has(statusId)) {
        reachedStartColumn = true;
      }
      if (reachedStartColumn && !doneStatuses.has(statusId)) {
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

async function handleGET(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireWorkspaceContext();
    assertTrustedMutationRequest(req);
    const { scopeId } = await params;
    const issueKey = normalizeIssueKey(req.nextUrl.searchParams.get('issueKey'));
    if (!issueKey) {
      return Response.json(
        { code: 'INVALID_REQUEST', message: 'issueKey is required.' },
        { status: 400 },
      );
    }

    enforceRateLimit(req, {
      bucket: 'scope-epic-forecasts:lookup',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${scopeId}`,
      max: 30,
      windowMs: 5 * 60_000,
    });

    const db = getPrismaClient();
    const scope = await getFlowScope(db, ctx.workspaceId, scopeId);
    if (!scope) {
      return Response.json({ code: 'NOT_FOUND', message: 'Flow scope not found.' }, { status: 404 });
    }

    const connection = await requireJiraConnection(ctx.workspaceId, scope.connectionId);
    const client = await createClientForConnection(connection);
    const epic = await client.get<JiraEpicIssue>(`/rest/api/2/issue/${encodeURIComponent(issueKey)}`, {
      params: { fields: 'summary,duedate,status' },
    });
    const boardDetail = await getBoardDetail(client, Number(scope.boardId));
    const remainingStoriesJql = buildEpicRemainingStoriesJql(
      issueKey,
      scope.includedIssueTypeIds,
      getCountableStatusIds(boardDetail.columns, scope.startStatusIds, scope.doneStatusIds),
    );
    const remainingStoryCount = remainingStoriesJql
      ? await fetchJqlIssueCount(client, remainingStoriesJql)
      : 0;

    return Response.json({
      jiraIssueKey: epic.key,
      summary: epic.fields.summary ?? epic.key,
      dueDate: epic.fields.duedate ?? null,
      epicLinkStoryCount: remainingStoryCount,
      jiraStoryCount: null,
      statusName: epic.fields.status?.name ?? null,
      directUrl: buildJiraIssueUrl(connection.baseUrl, epic.key),
    });
  } catch (err) {
    if (err instanceof ResponseError) {
      return err.response;
    }
    if (err instanceof JiraClientError && err.code === 'not_found') {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Epic was not found in Jira.' },
        { status: 404 },
      );
    }
    logger.error('Failed to look up Jira epic', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

export const GET = withHttpMetrics(
  'GET',
  '/api/v1/scopes/[scopeId]/epic-forecasts/lookup',
  handleGET,
);
