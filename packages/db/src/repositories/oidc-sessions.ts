import { Prisma, type OidcSession, type PrismaClient } from '@prisma/client';

type OidcSessionClient = PrismaClient | Prisma.TransactionClient;

export interface CreateOidcSessionInput {
  workspaceId: string;
  workspaceUserId: string;
  issuer: string;
  subject: string;
  idTokenSecretRef: string | null;
  accessTokenSecretRef: string | null;
  refreshTokenSecretRef: string | null;
  accessTokenExpiresAt: Date | null;
}

export async function createOidcSession(
  client: OidcSessionClient,
  input: CreateOidcSessionInput,
): Promise<OidcSession> {
  return client.oidcSession.create({
    data: {
      workspaceId: input.workspaceId,
      workspaceUserId: input.workspaceUserId,
      issuer: input.issuer,
      subject: input.subject,
      idTokenSecretRef: input.idTokenSecretRef,
      accessTokenSecretRef: input.accessTokenSecretRef,
      refreshTokenSecretRef: input.refreshTokenSecretRef,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
    },
  });
}

export async function getOidcSessionById(
  client: OidcSessionClient,
  sessionId: string,
): Promise<OidcSession | null> {
  return client.oidcSession.findUnique({ where: { id: sessionId } });
}

export type OidcSessionWithUser = Prisma.OidcSessionGetPayload<{
  include: { user: true };
}>;

export async function getOidcSessionWithUserById(
  client: OidcSessionClient,
  sessionId: string,
): Promise<OidcSessionWithUser | null> {
  return client.oidcSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
}

export async function updateOidcSessionTokens(
  client: OidcSessionClient,
  sessionId: string,
  input: {
    idTokenSecretRef?: string | null;
    accessTokenSecretRef?: string | null;
    refreshTokenSecretRef?: string | null;
    accessTokenExpiresAt?: Date | null;
  },
): Promise<void> {
  await client.oidcSession.update({
    where: { id: sessionId },
    data: input,
  });
}

export async function deleteOidcSessionById(
  client: OidcSessionClient,
  sessionId: string,
): Promise<boolean> {
  const deleted = await client.oidcSession.deleteMany({ where: { id: sessionId } });
  return deleted.count > 0;
}
