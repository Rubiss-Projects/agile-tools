import { Prisma, type FlowScopeUserRole, type PrismaClient, type WorkspaceUser } from '@prisma/client';

type FlowScopeUserRoleClient = PrismaClient | Prisma.TransactionClient;

export interface FlowScopeUserRoleAssignmentWithUser {
  id: string;
  workspaceId: string;
  scopeId: string;
  workspaceUserId: string;
  role: FlowScopeUserRole;
  assignedAt: Date;
  assignedBy: string | null;
  user: WorkspaceUser;
}

export async function listFlowScopeUserRoleAssignments(
  client: FlowScopeUserRoleClient,
  workspaceId: string,
  scopeId: string,
  role: FlowScopeUserRole = 'owner',
): Promise<FlowScopeUserRoleAssignmentWithUser[]> {
  return client.flowScopeUserRoleAssignment.findMany({
    where: { workspaceId, scopeId, role },
    include: { user: true },
    orderBy: { assignedAt: 'asc' },
  });
}

export async function userHasFlowScopeRole(
  client: FlowScopeUserRoleClient,
  workspaceId: string,
  scopeId: string,
  workspaceUserId: string,
  role: FlowScopeUserRole = 'owner',
): Promise<boolean> {
  const assignment = await client.flowScopeUserRoleAssignment.findFirst({
    where: { workspaceId, scopeId, workspaceUserId, role },
    select: { id: true },
  });
  return assignment !== null;
}

export async function addFlowScopeUserRoleAssignment(
  client: FlowScopeUserRoleClient,
  workspaceId: string,
  scopeId: string,
  workspaceUserId: string,
  assignedBy: string | null,
  role: FlowScopeUserRole = 'owner',
): Promise<void> {
  await client.flowScopeUserRoleAssignment.upsert({
    where: {
      scopeId_workspaceUserId_role: {
        scopeId,
        workspaceUserId,
        role,
      },
    },
    create: {
      workspaceId,
      scopeId,
      workspaceUserId,
      role,
      assignedBy,
    },
    update: {
      workspaceId,
      assignedBy,
    },
  });
}

export async function removeFlowScopeUserRoleAssignment(
  client: FlowScopeUserRoleClient,
  workspaceId: string,
  scopeId: string,
  workspaceUserId: string,
  role: FlowScopeUserRole = 'owner',
): Promise<boolean> {
  const result = await client.flowScopeUserRoleAssignment.deleteMany({
    where: { workspaceId, scopeId, workspaceUserId, role },
  });
  return result.count > 0;
}
