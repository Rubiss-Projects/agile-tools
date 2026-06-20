-- Self-hosted OIDC users and server-side logout token handling.

CREATE TYPE "WorkspaceUserRole" AS ENUM (
  'admin',
  'member'
);

CREATE TABLE "WorkspaceUser" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "authProvider" TEXT NOT NULL,
  "externalSubject" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "role" "WorkspaceUserRole" NOT NULL DEFAULT 'member',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_authProvider_externalSubject_key"
  ON "WorkspaceUser"("workspaceId", "authProvider", "externalSubject");
CREATE INDEX "WorkspaceUser_workspaceId_role_idx"
  ON "WorkspaceUser"("workspaceId", "role");
CREATE INDEX "WorkspaceUser_email_idx"
  ON "WorkspaceUser"("email");

ALTER TABLE "WorkspaceUser"
  ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OidcSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceUserId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "idTokenSecretRef" TEXT,
  "accessTokenSecretRef" TEXT,
  "refreshTokenSecretRef" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OidcSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OidcSession_workspaceUserId_idx"
  ON "OidcSession"("workspaceUserId");
CREATE INDEX "OidcSession_workspaceId_createdAt_idx"
  ON "OidcSession"("workspaceId", "createdAt");

ALTER TABLE "OidcSession"
  ADD CONSTRAINT "OidcSession_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OidcSession_workspaceUserId_fkey"
    FOREIGN KEY ("workspaceUserId") REFERENCES "WorkspaceUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
