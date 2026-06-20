import { Prisma, type PrismaClient, type WorkspaceUser, type WorkspaceUserRole } from '@prisma/client';

type WorkspaceUserClient = PrismaClient | Prisma.TransactionClient;

export interface UpsertOidcWorkspaceUserInput {
  workspaceId: string;
  externalSubject: string;
  email: string | null;
  displayName: string | null;
  initialRole: WorkspaceUserRole;
  now?: Date;
}

export async function upsertOidcWorkspaceUser(
  client: WorkspaceUserClient,
  input: UpsertOidcWorkspaceUserInput,
): Promise<WorkspaceUser> {
  const now = input.now ?? new Date();

  return client.workspaceUser.upsert({
    where: {
      workspaceId_authProvider_externalSubject: {
        workspaceId: input.workspaceId,
        authProvider: 'oidc',
        externalSubject: input.externalSubject,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      authProvider: 'oidc',
      externalSubject: input.externalSubject,
      email: input.email,
      displayName: input.displayName,
      role: input.initialRole,
      lastLoginAt: now,
    },
    update: {
      email: input.email,
      displayName: input.displayName,
      lastLoginAt: now,
    },
  });
}

export async function listWorkspaceUsers(
  client: WorkspaceUserClient,
  workspaceId: string,
): Promise<WorkspaceUser[]> {
  return client.workspaceUser.findMany({
    where: { workspaceId },
    orderBy: [
      { displayName: 'asc' },
      { email: 'asc' },
      { createdAt: 'asc' },
    ],
  });
}

export async function getWorkspaceUser(
  client: WorkspaceUserClient,
  workspaceId: string,
  workspaceUserId: string,
): Promise<WorkspaceUser | null> {
  return client.workspaceUser.findFirst({
    where: { workspaceId, id: workspaceUserId },
  });
}
