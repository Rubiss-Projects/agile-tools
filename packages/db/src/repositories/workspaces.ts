import { Prisma, type PrismaClient, type Workspace } from '@prisma/client';

type WorkspaceClient = PrismaClient | Prisma.TransactionClient;

export interface CreateHostedWorkspaceInput {
  name: string;
  clerkOrgId: string;
  defaultTimezone: string;
}

export async function getWorkspaceByClerkOrgId(
  client: WorkspaceClient,
  clerkOrgId: string,
): Promise<Workspace | null> {
  return client.workspace.findUnique({ where: { clerkOrgId } });
}

export async function getWorkspaceById(
  client: WorkspaceClient,
  workspaceId: string,
): Promise<Workspace | null> {
  return client.workspace.findUnique({ where: { id: workspaceId } });
}

export async function createHostedWorkspace(
  client: WorkspaceClient,
  input: CreateHostedWorkspaceInput,
): Promise<Workspace> {
  return client.workspace.create({
    data: {
      name: input.name,
      clerkOrgId: input.clerkOrgId,
      defaultTimezone: input.defaultTimezone,
    },
  });
}

export async function linkWorkspaceToClerkOrg(
  client: WorkspaceClient,
  workspaceId: string,
  clerkOrgId: string,
): Promise<Workspace | null> {
  try {
    return await client.workspace.update({
      where: { id: workspaceId },
      data: { clerkOrgId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}
