-- Hosted Vercel beta support while preserving the existing self-hosted PAT model.

CREATE TYPE "JiraAuthType" AS ENUM (
  'data_center_pat',
  'cloud_oauth_3lo'
);

CREATE TYPE "HostedSyncTaskStatus" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);

CREATE TYPE "HostedCapacityReservationKind" AS ENUM (
  'workspace',
  'jira_connection',
  'flow_scope',
  'org_member'
);

ALTER TABLE "Workspace"
  ADD COLUMN "clerkOrgId" TEXT;

CREATE UNIQUE INDEX "Workspace_clerkOrgId_key" ON "Workspace"("clerkOrgId");

ALTER TABLE "JiraConnection"
  ADD COLUMN "cloudId" TEXT,
  ADD COLUMN "siteUrl" TEXT,
  ADD COLUMN "atlassianAccountId" TEXT,
  ADD COLUMN "oauthScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "accessTokenSecretRef" TEXT,
  ADD COLUMN "refreshTokenSecretRef" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3);

UPDATE "JiraConnection"
SET "authType" = 'data_center_pat'
WHERE "authType" = 'pat';

ALTER TABLE "JiraConnection"
  ALTER COLUMN "encryptedSecretRef" DROP NOT NULL,
  ALTER COLUMN "authType" DROP DEFAULT,
  ALTER COLUMN "authType" TYPE "JiraAuthType"
    USING (
      CASE
        WHEN "authType" = 'cloud_oauth_3lo' THEN 'cloud_oauth_3lo'
        ELSE 'data_center_pat'
      END
    )::"JiraAuthType",
  ALTER COLUMN "authType" SET DEFAULT 'data_center_pat';

CREATE TABLE "HostedSyncTask" (
  "id" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "cursor" JSONB,
  "status" "HostedSyncTaskStatus" NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "dedupeKey" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HostedSyncTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostedSyncTask_dedupeKey_key" ON "HostedSyncTask"("dedupeKey");
CREATE INDEX "HostedSyncTask_syncRunId_status_idx" ON "HostedSyncTask"("syncRunId", "status");
CREATE INDEX "HostedSyncTask_scopeId_status_idx" ON "HostedSyncTask"("scopeId", "status");

ALTER TABLE "HostedSyncTask"
  ADD CONSTRAINT "HostedSyncTask_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "HostedSyncTask_scopeId_fkey"
    FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SyncRunCheckpoint" (
  "id" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "cursor" JSONB,
  "counts" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncRunCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncRunCheckpoint_syncRunId_key" ON "SyncRunCheckpoint"("syncRunId");

ALTER TABLE "SyncRunCheckpoint"
  ADD CONSTRAINT "SyncRunCheckpoint_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HostedUsageBudget" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "limit" INTEGER NOT NULL,
  "warnAt" INTEGER NOT NULL,
  "blockAt" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HostedUsageBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostedUsageBudget_key_key" ON "HostedUsageBudget"("key");

CREATE TABLE "HostedUsageCounter" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "key" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HostedUsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostedUsageCounter_workspaceId_key_period_key"
  ON "HostedUsageCounter"("workspaceId", "key", "period");
CREATE INDEX "HostedUsageCounter_key_period_idx" ON "HostedUsageCounter"("key", "period");

ALTER TABLE "HostedUsageCounter"
  ADD CONSTRAINT "HostedUsageCounter_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HostedCapacityReservation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "kind" "HostedCapacityReservationKind" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HostedCapacityReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostedCapacityReservation_kind_resourceId_key"
  ON "HostedCapacityReservation"("kind", "resourceId");
CREATE INDEX "HostedCapacityReservation_workspaceId_kind_idx"
  ON "HostedCapacityReservation"("workspaceId", "kind");

ALTER TABLE "HostedCapacityReservation"
  ADD CONSTRAINT "HostedCapacityReservation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
