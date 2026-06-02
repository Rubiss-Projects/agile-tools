import { type NextRequest } from 'next/server';
import {
  getFlowScope,
  getJiraConnection,
  getPrismaClient,
  deleteEpicForecastTarget,
  updateEpicForecastTargetById,
} from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { UpsertEpicForecastTargetRequestSchema } from '@agile-tools/shared/contracts/epic-forecast';
import { requireWorkspaceContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { withHttpMetrics } from '@/server/route-metrics';

function buildJiraIssueUrl(baseUrl: string, issueKey: string): string {
  return `${baseUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}`;
}

function serializeTarget(target: {
  id: string;
  scopeId: string;
  jiraIssueKey: string;
  summary: string;
  dueDate: string;
  remainingStoryCount: number;
  storyCountSource: string;
  epicLinkStoryCount: number | null;
  jiraStoryCount: number | null;
  manualStoryCount: number | null;
  status: string;
  closedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}, jiraBaseUrl: string) {
  return {
    id: target.id,
    scopeId: target.scopeId,
    jiraIssueKey: target.jiraIssueKey,
    summary: target.summary,
    directUrl: buildJiraIssueUrl(jiraBaseUrl, target.jiraIssueKey),
    dueDate: target.dueDate,
    remainingStoryCount: target.remainingStoryCount,
    storyCountSource:
      target.storyCountSource === 'epic_link' || target.storyCountSource === 'jira_field'
        ? target.storyCountSource
        : 'manual',
    epicLinkStoryCount: target.epicLinkStoryCount,
    jiraStoryCount: target.jiraStoryCount,
    manualStoryCount: target.manualStoryCount,
    status: target.status === 'closed' ? 'closed' : 'active',
    closedAt: target.closedAt?.toISOString() ?? null,
    sortOrder: target.sortOrder,
    createdAt: target.createdAt.toISOString(),
    updatedAt: target.updatedAt.toISOString(),
  };
}

async function handlePATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string; targetId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireWorkspaceContext();
    assertTrustedMutationRequest(req);
    const { scopeId, targetId } = await params;
    enforceRateLimit(req, {
      bucket: 'scope-epic-forecasts:write',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${scopeId}`,
      max: 60,
      windowMs: 5 * 60_000,
    });

    const db = getPrismaClient();
    const scope = await getFlowScope(db, ctx.workspaceId, scopeId);
    if (!scope) {
      return Response.json({ code: 'NOT_FOUND', message: 'Flow scope not found.' }, { status: 404 });
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = UpsertEpicForecastTargetRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body.',
          details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 },
      );
    }

    const storyCountSource = parsed.data.storyCountSource ?? 'manual';
    const updated = await updateEpicForecastTargetById(db, scopeId, targetId, {
      jiraIssueKey: parsed.data.jiraIssueKey.toUpperCase(),
      summary: parsed.data.summary,
      dueDate: parsed.data.dueDate,
      remainingStoryCount: parsed.data.remainingStoryCount,
      storyCountSource,
      epicLinkStoryCount: parsed.data.epicLinkStoryCount ?? null,
      jiraStoryCount: parsed.data.jiraStoryCount ?? null,
      manualStoryCount:
        storyCountSource === 'manual'
          ? parsed.data.manualStoryCount ?? parsed.data.remainingStoryCount
          : null,
      status: parsed.data.status ?? 'active',
      closedAt: parsed.data.closedAt ? new Date(parsed.data.closedAt) : null,
      sortOrder: parsed.data.sortOrder ?? 0,
    });
    if (!updated) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Epic forecast target not found.' },
        { status: 404 },
      );
    }

    const connection = await getJiraConnection(db, ctx.workspaceId, scope.connectionId);
    if (!connection) {
      return Response.json({ code: 'NOT_FOUND', message: 'Jira connection not found.' }, { status: 404 });
    }

    return Response.json(serializeTarget(updated, connection.baseUrl));
  } catch (err) {
    if (err instanceof ResponseError) {
      return err.response;
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return Response.json(
        { code: 'CONFLICT', message: 'Another epic forecast target already uses that Jira issue key.' },
        { status: 409 },
      );
    }
    logger.error('Failed to update epic forecast target', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

async function handleDELETE(
  req: NextRequest,
  { params }: { params: Promise<{ scopeId: string; targetId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireWorkspaceContext();
    assertTrustedMutationRequest(req);
    const { scopeId, targetId } = await params;
    enforceRateLimit(req, {
      bucket: 'scope-epic-forecasts:write',
      identifier: `${ctx.workspaceId}:${ctx.userId}:${scopeId}`,
      max: 60,
      windowMs: 5 * 60_000,
    });

    const db = getPrismaClient();
    const scope = await getFlowScope(db, ctx.workspaceId, scopeId);
    if (!scope) {
      return Response.json({ code: 'NOT_FOUND', message: 'Flow scope not found.' }, { status: 404 });
    }

    const deleted = await deleteEpicForecastTarget(db, scopeId, targetId);
    if (!deleted) {
      return Response.json(
        { code: 'NOT_FOUND', message: 'Epic forecast target not found.' },
        { status: 404 },
      );
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ResponseError) {
      return err.response;
    }
    logger.error('Failed to delete epic forecast target', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}

export const DELETE = withHttpMetrics(
  'DELETE',
  '/api/v1/scopes/[scopeId]/epic-forecasts/[targetId]',
  handleDELETE,
);
export const PATCH = withHttpMetrics(
  'PATCH',
  '/api/v1/scopes/[scopeId]/epic-forecasts/[targetId]',
  handlePATCH,
);
