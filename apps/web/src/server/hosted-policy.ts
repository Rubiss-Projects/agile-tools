import {
  countHostedConnections,
  countHostedScopes,
  countHostedSyncRunsForWorkspaceDay,
  countHostedWorkspaces,
  ensureHostedUsageBudgets,
  getHostedBudgetStates,
  getPrismaClient,
} from '@agile-tools/db';
import { getConfig, isHostedMode } from '@agile-tools/shared';

import { countHostedClerkOrgMembers } from './auth';
import { ResponseError } from './errors';

export type HostedWriteOperation =
  | 'workspace_create'
  | 'jira_connection_create'
  | 'scope_create'
  | 'scheduled_sync'
  | 'manual_sync';

export interface HostedBudgetWarning {
  code: string;
  message: string;
}

function budgetSeeds() {
  const config = getConfig();
  return [
    { key: 'prisma_monthly_operations', limit: config.HOSTED_PRISMA_MONTHLY_OP_BUDGET },
    {
      key: 'vercel_function_invocations',
      limit: config.HOSTED_VERCEL_FUNCTION_INVOCATION_BUDGET,
    },
    {
      key: 'vercel_queue_operations',
      limit: config.HOSTED_VERCEL_QUEUE_OPERATION_BUDGET,
    },
    {
      key: 'vercel_active_cpu_hours',
      limit: Math.ceil(config.HOSTED_VERCEL_ACTIVE_CPU_HOURS_BUDGET),
    },
  ];
}

export async function getHostedBudgetWarnings(): Promise<HostedBudgetWarning[]> {
  if (!isHostedMode()) return [];

  const db = getPrismaClient();
  await ensureHostedUsageBudgets(db, budgetSeeds());
  const states = await getHostedBudgetStates(db);
  return states
    .filter((state) => state.warning)
    .map((state) => ({
      code: state.blocked ? 'HOSTED_BUDGET_BLOCKED' : 'HOSTED_BUDGET_WARNING',
      message: `${state.key} is at ${state.value}/${state.limit}.`,
    }));
}

export async function assertHostedWriteAllowed(operation: HostedWriteOperation): Promise<void> {
  if (!isHostedMode()) return;

  const db = getPrismaClient();
  await ensureHostedUsageBudgets(db, budgetSeeds());
  const states = await getHostedBudgetStates(db);
  const warnings = states.filter((state) => state.warning);
  if (operation === 'scheduled_sync' && warnings.length > 0) {
    throw new ResponseError(
      Response.json(
        {
          code: 'HOSTED_BUDGET_WARNING',
          message: 'Scheduled sync is disabled because hosted beta budget usage is at or above 80 percent.',
          details: warnings.map((state) => `${state.key}: ${state.value}/${state.limit}`),
        },
        { status: 429 },
      ),
    );
  }

  const blocked = states.filter((state) => state.blocked);
  if (blocked.length === 0) return;

  const blockedWrites: HostedWriteOperation[] = [
    'workspace_create',
    'jira_connection_create',
    'scope_create',
    'scheduled_sync',
    'manual_sync',
  ];
  if (!blockedWrites.includes(operation)) return;

  throw new ResponseError(
    Response.json(
      {
        code: 'HOSTED_BUDGET_EXHAUSTED',
        message: 'Hosted beta budget is exhausted. Existing analytics remain readable.',
        details: blocked.map((state) => `${state.key}: ${state.value}/${state.limit}`),
      },
      { status: 429 },
    ),
  );
}

export async function assertHostedWorkspaceCapacity(): Promise<void> {
  if (!isHostedMode()) return;

  const config = getConfig();
  const count = await countHostedWorkspaces(getPrismaClient());
  if (count < config.HOSTED_BETA_MAX_WORKSPACES) return;

  throw capacityError(
    'HOSTED_WORKSPACE_CAP_EXHAUSTED',
    `Hosted beta workspace capacity is full (${count}/${config.HOSTED_BETA_MAX_WORKSPACES}).`,
  );
}

export async function assertHostedConnectionCapacity(workspaceId: string): Promise<void> {
  if (!isHostedMode()) return;

  const config = getConfig();
  const count = await countHostedConnections(getPrismaClient(), workspaceId);
  if (count < config.HOSTED_BETA_MAX_CONNECTIONS_PER_WORKSPACE) return;

  throw capacityError(
    'HOSTED_CONNECTION_CAP_EXHAUSTED',
    `Hosted beta allows ${config.HOSTED_BETA_MAX_CONNECTIONS_PER_WORKSPACE} Jira Cloud connection per workspace.`,
  );
}

export async function assertHostedScopeCapacity(workspaceId: string): Promise<void> {
  if (!isHostedMode()) return;

  const config = getConfig();
  const count = await countHostedScopes(getPrismaClient(), workspaceId);
  if (count < config.HOSTED_BETA_MAX_SCOPES_PER_WORKSPACE) return;

  throw capacityError(
    'HOSTED_SCOPE_CAP_EXHAUSTED',
    `Hosted beta allows ${config.HOSTED_BETA_MAX_SCOPES_PER_WORKSPACE} flow scope per workspace.`,
  );
}

export async function assertHostedOrgMemberCapacity(clerkOrgId: string): Promise<void> {
  if (!isHostedMode()) return;

  const config = getConfig();
  const count = await countHostedClerkOrgMembers(
    clerkOrgId,
    config.HOSTED_BETA_MAX_ORG_MEMBERS + 1,
  );
  if (count <= config.HOSTED_BETA_MAX_ORG_MEMBERS) return;

  throw capacityError(
    'HOSTED_ORG_MEMBER_CAP_EXHAUSTED',
    `Hosted beta allows ${config.HOSTED_BETA_MAX_ORG_MEMBERS} members per Clerk organization.`,
  );
}

export async function assertHostedManualSyncCapacity(workspaceId: string): Promise<void> {
  if (!isHostedMode()) return;

  const config = getConfig();
  const count = await countHostedSyncRunsForWorkspaceDay(getPrismaClient(), workspaceId);
  if (count < config.HOSTED_BETA_MAX_SYNC_RUNS_PER_WORKSPACE_PER_DAY) return;

  throw capacityError(
    'HOSTED_DAILY_SYNC_CAP_EXHAUSTED',
    `Hosted beta allows ${config.HOSTED_BETA_MAX_SYNC_RUNS_PER_WORKSPACE_PER_DAY} sync runs per workspace per day.`,
  );
}

function capacityError(code: string, message: string): ResponseError {
  return new ResponseError(Response.json({ code, message }, { status: 429 }));
}
