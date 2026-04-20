import { type NextRequest } from 'next/server';
import { getPrismaClient, createFlowScope } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { CreateFlowScopeRequestSchema } from '@agile-tools/shared/contracts/api';
import { getBoardDetail } from '@agile-tools/jira-client';
import { requireAdminContext } from '@/server/auth';
import { ResponseError } from '@/server/errors';
import { assertTrustedMutationRequest, enforceRateLimit } from '@/server/request-security';
import { requireJiraConnection, createClientForConnection, normalizeJiraError } from '../jira-connections/_lib';
import { mapScope } from './_lib';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ctx = await requireAdminContext();
    assertTrustedMutationRequest(req);
    enforceRateLimit(req, {
      bucket: 'admin-scopes:create',
      identifier: `${ctx.workspaceId}:${ctx.userId}`,
      max: 20,
      windowMs: 5 * 60_000,
    });

    const body: unknown = await req.json().catch(() => null);
    const parsed = CreateFlowScopeRequestSchema.safeParse(body);
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

    const conn = await requireJiraConnection(ctx.workspaceId, parsed.data.connectionId);
    const client = createClientForConnection(conn);

    let boardName: string;
    try {
      const boardDetail = await getBoardDetail(client, parsed.data.boardId);
      boardName = boardDetail.boardName;
    } catch (err) {
      const jiraErr = normalizeJiraError(err);
      return Response.json(
        {
          code: jiraErr?.code ?? 'JIRA_ERROR',
          message: jiraErr?.message ?? 'Failed to fetch board details from Jira.',
        },
        { status: jiraErr?.statusCode === 404 ? 404 : 502 },
      );
    }

    const prisma = getPrismaClient();
    let scope;
    try {
      scope = await createFlowScope(prisma, ctx.workspaceId, {
        connectionId: parsed.data.connectionId,
        boardId: parsed.data.boardId,
        boardName,
        timezone: parsed.data.timezone,
        includedIssueTypeIds: parsed.data.includedIssueTypeIds,
        startStatusIds: parsed.data.startStatusIds,
        doneStatusIds: parsed.data.doneStatusIds,
        syncIntervalMinutes: parsed.data.syncIntervalMinutes,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('disjoint')) {
        return Response.json(
          { code: 'INVALID_REQUEST', message: err.message },
          { status: 400 },
        );
      }
      throw err;
    }

    return Response.json(mapScope(scope), { status: 201 });
  } catch (err) {
    if (err instanceof ResponseError) return err.response;
    logger.error('Failed to create flow scope', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
