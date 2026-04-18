import { type NextRequest } from 'next/server';
import { getPrismaClient, createJiraConnection } from '@agile-tools/db';
import { getConfig, encryptSecret, logger } from '@agile-tools/shared';
import { CreateJiraConnectionRequestSchema } from '@agile-tools/shared/contracts/api';
import { requireAdminContext } from '@/server/auth';
import { mapConnection } from './_lib';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ctx = await requireAdminContext();

    const body: unknown = await req.json().catch(() => null);
    const parsed = CreateJiraConnectionRequestSchema.safeParse(body);
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

    // Normalize base URL and encrypt the PAT — the raw PAT is never persisted.
    const baseUrl = parsed.data.baseUrl.replace(/\/$/, '');
    const { ENCRYPTION_KEY } = getConfig();
    const encryptedSecretRef = encryptSecret(parsed.data.pat, ENCRYPTION_KEY);

    const prisma = getPrismaClient();
    const conn = await createJiraConnection(prisma, ctx.workspaceId, {
      baseUrl,
      encryptedSecretRef,
      ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
    });

    return Response.json(mapConnection(conn), { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    logger.error('Failed to create Jira connection', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      { status: 500 },
    );
  }
}
