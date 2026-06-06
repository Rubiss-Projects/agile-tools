import { Prisma, type HostedCapacityReservationKind, type PrismaClient } from '@prisma/client';

type HostedUsageClient = PrismaClient | Prisma.TransactionClient;

export interface HostedBudgetSeed {
  key: string;
  limit: number;
}

export interface HostedBudgetState {
  key: string;
  limit: number;
  warnAt: number;
  blockAt: number;
  value: number;
  warning: boolean;
  blocked: boolean;
}

function currentMonthPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function ensureHostedUsageBudgets(
  client: HostedUsageClient,
  seeds: HostedBudgetSeed[],
): Promise<void> {
  for (const seed of seeds) {
    const warnAt = Math.ceil(seed.limit * 0.8);
    await client.hostedUsageBudget.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        limit: seed.limit,
        warnAt,
        blockAt: seed.limit,
      },
      update: {
        limit: seed.limit,
        warnAt,
        blockAt: seed.limit,
        enabled: true,
      },
    });
  }
}

export async function getHostedBudgetStates(
  client: HostedUsageClient,
  now = new Date(),
): Promise<HostedBudgetState[]> {
  const period = currentMonthPeriod(now);
  const budgets = await client.hostedUsageBudget.findMany({ where: { enabled: true } });
  const counters = await client.hostedUsageCounter.findMany({
    where: {
      workspaceId: null,
      period,
      key: { in: budgets.map((budget) => budget.key) },
    },
  });
  const valueByKey = new Map<string, number>();
  for (const counter of counters) {
    valueByKey.set(counter.key, (valueByKey.get(counter.key) ?? 0) + counter.value);
  }

  return budgets.map((budget) => {
    const value = valueByKey.get(budget.key) ?? 0;
    return {
      key: budget.key,
      limit: budget.limit,
      warnAt: budget.warnAt,
      blockAt: budget.blockAt,
      value,
      warning: value >= budget.warnAt,
      blocked: value >= budget.blockAt,
    };
  });
}

export async function incrementHostedUsageCounter(
  client: HostedUsageClient,
  key: string,
  amount = 1,
  input?: { workspaceId?: string; now?: Date },
): Promise<void> {
  const period = currentMonthPeriod(input?.now);
  if (input?.workspaceId === undefined) {
    await client.hostedUsageCounter.create({
      data: {
        workspaceId: null,
        key,
        period,
        value: amount,
      },
    });
    return;
  }

  await client.hostedUsageCounter.upsert({
    where: {
      workspaceId_key_period: {
        workspaceId: input.workspaceId,
        key,
        period,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      key,
      period,
      value: amount,
    },
    update: {
      value: { increment: amount },
    },
  });
}

export async function countHostedWorkspaces(client: HostedUsageClient): Promise<number> {
  return client.workspace.count({ where: { clerkOrgId: { not: null } } });
}

export async function countHostedConnections(
  client: HostedUsageClient,
  workspaceId: string,
): Promise<number> {
  return client.jiraConnection.count({ where: { workspaceId, authType: 'cloud_oauth_3lo' } });
}

export async function countHostedScopes(
  client: HostedUsageClient,
  workspaceId: string,
): Promise<number> {
  return client.flowScope.count({ where: { workspaceId } });
}

export async function countHostedSyncRunsForWorkspaceDay(
  client: HostedUsageClient,
  workspaceId: string,
  now = new Date(),
): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return client.syncRun.count({
    where: {
      scope: { workspaceId },
      createdAt: { gte: start, lt: end },
    },
  });
}

export async function reserveHostedCapacity(
  client: HostedUsageClient,
  kind: HostedCapacityReservationKind,
  resourceId: string,
  workspaceId?: string,
): Promise<void> {
  await client.hostedCapacityReservation.upsert({
    where: { kind_resourceId: { kind, resourceId } },
    create: {
      kind,
      resourceId,
      workspaceId: workspaceId ?? null,
    },
    update: {
      workspaceId: workspaceId ?? null,
    },
  });
}

export async function releaseHostedCapacityReservation(
  client: HostedUsageClient,
  kind: HostedCapacityReservationKind,
  resourceId: string,
): Promise<boolean> {
  const deleted = await client.hostedCapacityReservation.deleteMany({
    where: { kind, resourceId },
  });
  return deleted.count > 0;
}

export async function countHostedCapacityReservations(
  client: HostedUsageClient,
  kind: HostedCapacityReservationKind,
  workspaceId?: string,
): Promise<number> {
  const where: Prisma.HostedCapacityReservationWhereInput = { kind };
  if (workspaceId !== undefined) {
    where.workspaceId = workspaceId;
  }
  return client.hostedCapacityReservation.count({ where });
}
