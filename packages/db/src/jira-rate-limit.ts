import type { PrismaClient, JiraConnection } from '@prisma/client';
import { getConfig, JiraRateLimiter, JiraRateStateSchema, type JiraRateStore } from '@agile-tools/shared';

export function createPostgresJiraRateLimiter(db: PrismaClient, connectionId: string, requestBudgetPerMinute?: number | null,
  identity?: Pick<JiraConnection, 'baseUrl' | 'encryptedSecretRef'>): JiraRateLimiter {
  const config = getConfig();
  const store: JiraRateStore = {
    update: (change) => db.$transaction(async (tx) => {
      if (identity) {
        const [current] = await tx.$queryRaw<Array<Pick<JiraConnection, 'baseUrl' | 'encryptedSecretRef'>>>`
          SELECT "baseUrl", "encryptedSecretRef" FROM "JiraConnection" WHERE id = ${connectionId} FOR SHARE
        `;
        if (!current || current.baseUrl !== identity.baseUrl || current.encryptedSecretRef !== identity.encryptedSecretRef) {
          throw new Error('Jira connection changed; recreate the Jira client.');
        }
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`jira-rate:${connectionId}`}, 0))`;
      const row = await tx.jiraRateLimitState.findUnique({ where: { connectionId } });
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = clock!.now.getTime();
      const state = JiraRateStateSchema.parse(row?.state ?? { updatedAt: now });
      const result = change(state, now);
      await tx.jiraRateLimitState.upsert({
        where: { connectionId }, create: { connectionId, state }, update: { state },
      });
      return result;
    }),
  };
  return new JiraRateLimiter(store, {
    fraction: config.JIRA_RATE_FRACTION,
    reserveFraction: config.JIRA_RATE_RESERVE_FRACTION,
    maxConcurrency: config.JIRA_MAX_CONCURRENCY,
    ...(requestBudgetPerMinute !== undefined ? { requestBudgetPerMinute } : {}),
  });
}

/** A short transaction claims a renewable connection lease; no transaction spans Jira I/O. */
export async function claimConnectionSync(db: PrismaClient, connectionId: string, syncRunId: string, leaseToken = syncRunId, expectedUpdatedAt?: Date): Promise<boolean> {
  const changed = await db.$executeRaw`
    UPDATE "JiraConnection" SET "activeSyncRunId" = ${syncRunId}, "activeSyncLeaseToken" = ${leaseToken}, "syncLeaseUntil" = NOW() + INTERVAL '2 minutes'
    WHERE id = ${connectionId} AND ("syncLeaseUntil" IS NULL OR "syncLeaseUntil" < NOW())
      AND (${expectedUpdatedAt ?? null}::timestamp IS NULL OR "updatedAt" = ${expectedUpdatedAt ?? null})
  `;
  return changed > 0;
}

export async function renewConnectionSync(db: PrismaClient, connectionId: string, syncRunId: string, leaseToken = syncRunId): Promise<boolean> {
  const changed = await db.$executeRaw`
    UPDATE "JiraConnection" SET "syncLeaseUntil" = NOW() + INTERVAL '2 minutes'
    WHERE id = ${connectionId} AND "activeSyncRunId" = ${syncRunId} AND "activeSyncLeaseToken" = ${leaseToken} AND "syncLeaseUntil" > NOW()
  `;
  return changed > 0;
}

export async function releaseConnectionSync(db: PrismaClient, connectionId: string, syncRunId: string, leaseToken = syncRunId): Promise<void> {
  await db.jiraConnection.updateMany({
    where: { id: connectionId, activeSyncRunId: syncRunId, activeSyncLeaseToken: leaseToken },
    data: { activeSyncRunId: null, activeSyncLeaseToken: null, syncLeaseUntil: null },
  });
}
