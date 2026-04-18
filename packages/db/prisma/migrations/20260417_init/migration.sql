-- Enable btree_gist for hold-period exclusion constraint (non-overlapping ranges).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Enum Types ──────────────────────────────────────────────────────────────

CREATE TYPE "ConnectionHealthStatus" AS ENUM (
  'draft',
  'validating',
  'healthy',
  'unhealthy',
  'stale',
  'disabled'
);

CREATE TYPE "FlowScopeStatus" AS ENUM (
  'active',
  'paused',
  'needs_attention'
);

CREATE TYPE "SyncRunTrigger" AS ENUM (
  'scheduled',
  'manual'
);

CREATE TYPE "SyncRunStatus" AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled'
);

CREATE TYPE "LifecycleEventType" AS ENUM (
  'status_change',
  'field_change',
  'reopened',
  'completed'
);

CREATE TYPE "HoldPeriodSource" AS ENUM (
  'status',
  'blocked_field'
);

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE "Workspace" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "defaultTimezone" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");

CREATE TABLE "JiraConnection" (
  "id"                 TEXT NOT NULL,
  "workspaceId"        TEXT NOT NULL,
  "baseUrl"            TEXT NOT NULL,
  "authType"           TEXT NOT NULL DEFAULT 'pat',
  "encryptedSecretRef" TEXT NOT NULL,
  "healthStatus"       "ConnectionHealthStatus" NOT NULL DEFAULT 'draft',
  "lastValidatedAt"    TIMESTAMP(3),
  "lastHealthyAt"      TIMESTAMP(3),
  "lastErrorCode"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraConnection_workspaceId_id_key" ON "JiraConnection"("workspaceId", "id");
CREATE INDEX "JiraConnection_workspaceId_idx" ON "JiraConnection"("workspaceId");

CREATE TABLE "FlowScope" (
  "id"                   TEXT NOT NULL,
  "workspaceId"          TEXT NOT NULL,
  "connectionId"         TEXT NOT NULL,
  "boardId"              TEXT NOT NULL,
  "boardName"            TEXT NOT NULL,
  "timezone"             TEXT NOT NULL,
  "includedIssueTypeIds" TEXT[] NOT NULL,
  "startStatusIds"       TEXT[] NOT NULL,
  "doneStatusIds"        TEXT[] NOT NULL,
  "syncIntervalMinutes"  INTEGER NOT NULL,
  "status"               "FlowScopeStatus" NOT NULL DEFAULT 'active',
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlowScope_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlowScope_syncIntervalMinutes_check" CHECK ("syncIntervalMinutes" > 0)
);

CREATE INDEX "FlowScope_workspaceId_idx" ON "FlowScope"("workspaceId");
CREATE INDEX "FlowScope_connectionId_idx" ON "FlowScope"("connectionId");

CREATE TABLE "BoardSnapshot" (
  "id"                TEXT NOT NULL,
  "scopeId"           TEXT NOT NULL,
  "syncRunId"         TEXT,
  "fetchedAt"         TIMESTAMP(3) NOT NULL,
  "columns"           JSONB NOT NULL,
  "statusIdsByColumn" JSONB NOT NULL,
  "projectRefs"       JSONB NOT NULL,
  "filterId"          TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardSnapshot_scopeId_fetchedAt_idx" ON "BoardSnapshot"("scopeId", "fetchedAt");

CREATE TABLE "HoldDefinition" (
  "id"                  TEXT NOT NULL,
  "scopeId"             TEXT NOT NULL,
  "holdStatusIds"       TEXT[] NOT NULL,
  "blockedFieldId"      TEXT,
  "blockedTruthyValues" TEXT[] NOT NULL,
  "effectiveFrom"       TIMESTAMP(3) NOT NULL,
  "updatedBy"           TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HoldDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HoldDefinition_holdStatusIds_nonempty_check" CHECK (array_length("holdStatusIds", 1) >= 1)
);

CREATE UNIQUE INDEX "HoldDefinition_scopeId_effectiveFrom_key" ON "HoldDefinition"("scopeId", "effectiveFrom");
CREATE INDEX "HoldDefinition_scopeId_effectiveFrom_idx" ON "HoldDefinition"("scopeId", "effectiveFrom");

CREATE TABLE "SyncRun" (
  "id"           TEXT NOT NULL,
  "scopeId"      TEXT NOT NULL,
  "trigger"      "SyncRunTrigger" NOT NULL,
  "status"       "SyncRunStatus" NOT NULL DEFAULT 'queued',
  "requestedBy"  TEXT,
  "startedAt"    TIMESTAMP(3),
  "finishedAt"   TIMESTAMP(3),
  "dataVersion"  TEXT,
  "errorCode"    TEXT,
  "errorSummary" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncRun_scopeId_createdAt_idx" ON "SyncRun"("scopeId", "createdAt");
CREATE INDEX "SyncRun_scopeId_status_idx" ON "SyncRun"("scopeId", "status");

CREATE TABLE "WorkItem" (
  "id"              TEXT NOT NULL,
  "scopeId"         TEXT NOT NULL,
  "jiraIssueId"     TEXT NOT NULL,
  "issueKey"        TEXT NOT NULL,
  "summary"         TEXT NOT NULL,
  "issueTypeId"     TEXT NOT NULL,
  "projectId"       TEXT NOT NULL,
  "currentStatusId" TEXT NOT NULL,
  "currentColumn"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL,
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "reopenedCount"   INTEGER NOT NULL DEFAULT 0,
  "directUrl"       TEXT NOT NULL,
  "excludedReason"  TEXT,
  "syncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncRunId"   TEXT,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkItem_scopeId_jiraIssueId_key" ON "WorkItem"("scopeId", "jiraIssueId");
CREATE INDEX "WorkItem_scopeId_completedAt_idx" ON "WorkItem"("scopeId", "completedAt");
CREATE INDEX "WorkItem_scopeId_currentColumn_idx" ON "WorkItem"("scopeId", "currentColumn");
CREATE INDEX "WorkItem_scopeId_startedAt_idx" ON "WorkItem"("scopeId", "startedAt");

-- Partial index for scatter-plot queries: active, non-excluded work items
CREATE INDEX "WorkItem_scopeId_active_idx"
  ON "WorkItem"("scopeId", "currentColumn")
  WHERE "completedAt" IS NULL AND "excludedReason" IS NULL;

CREATE TABLE "WorkItemLifecycleEvent" (
  "id"             TEXT NOT NULL,
  "workItemId"     TEXT NOT NULL,
  "rawChangelogId" TEXT,
  "eventType"      "LifecycleEventType" NOT NULL,
  "fromStatusId"   TEXT,
  "toStatusId"     TEXT,
  "changedFieldId" TEXT,
  "changedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkItemLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- PostgreSQL treats NULL as distinct in unique indexes, so rows without a
-- rawChangelogId are each unique by definition. Deduplication is only enforced
-- when rawChangelogId IS NOT NULL (all three fields must match to conflict).
CREATE UNIQUE INDEX "WorkItemLifecycleEvent_workItemId_rawChangelogId_eventType_key"
  ON "WorkItemLifecycleEvent"("workItemId", "rawChangelogId", "eventType");

CREATE INDEX "WorkItemLifecycleEvent_workItemId_changedAt_idx" ON "WorkItemLifecycleEvent"("workItemId", "changedAt");

CREATE TABLE "HoldPeriod" (
  "id"          TEXT NOT NULL,
  "workItemId"  TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL,
  "endedAt"     TIMESTAMP(3),
  "source"      "HoldPeriodSource" NOT NULL,
  "sourceValue" TEXT NOT NULL,
  CONSTRAINT "HoldPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HoldPeriod_dates_check" CHECK ("endedAt" IS NULL OR "endedAt" > "startedAt")
);

CREATE INDEX "HoldPeriod_workItemId_startedAt_idx" ON "HoldPeriod"("workItemId", "startedAt");
CREATE INDEX "HoldPeriod_workItemId_endedAt_idx" ON "HoldPeriod"("workItemId", "endedAt");

-- Enforce no overlapping hold periods for the same work item and source.
ALTER TABLE "HoldPeriod"
  ADD CONSTRAINT "HoldPeriod_no_overlap"
  EXCLUDE USING GIST (
    "workItemId"  WITH =,
    "source"::text WITH =,
    tsrange("startedAt", "endedAt") WITH &&
  );

CREATE TABLE "AgingThresholdModel" (
  "id"                   TEXT NOT NULL,
  "scopeId"              TEXT NOT NULL,
  "historicalWindowDays" INTEGER NOT NULL,
  "sampleSize"           INTEGER NOT NULL,
  "metricBasis"          TEXT NOT NULL DEFAULT 'cycle_time',
  "p50"                  DOUBLE PRECISION NOT NULL,
  "p70"                  DOUBLE PRECISION NOT NULL,
  "p85"                  DOUBLE PRECISION NOT NULL,
  "calculatedAt"         TIMESTAMP(3) NOT NULL,
  "dataVersion"          TEXT NOT NULL,
  "lowConfidenceReason"  TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgingThresholdModel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgingThresholdModel_percentiles_monotonic_check"
    CHECK ("p50" <= "p70" AND "p70" <= "p85")
);

CREATE INDEX "AgingThresholdModel_scopeId_calculatedAt_idx" ON "AgingThresholdModel"("scopeId", "calculatedAt");

CREATE TABLE "ForecastResultCache" (
  "id"                   TEXT NOT NULL,
  "scopeId"              TEXT NOT NULL,
  "requestHash"          TEXT NOT NULL,
  "historicalWindowDays" INTEGER NOT NULL,
  "iterations"           INTEGER NOT NULL,
  "confidenceLevels"     DOUBLE PRECISION[] NOT NULL,
  "sampleSize"           INTEGER NOT NULL,
  "dataVersion"          TEXT NOT NULL,
  "warnings"             JSONB NOT NULL,
  "resultPayload"        JSONB NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"            TIMESTAMP(3),
  CONSTRAINT "ForecastResultCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastResultCache_scopeId_requestHash_dataVersion_key"
  ON "ForecastResultCache"("scopeId", "requestHash", "dataVersion");
CREATE INDEX "ForecastResultCache_scopeId_dataVersion_idx"
  ON "ForecastResultCache"("scopeId", "dataVersion");

-- ─── Foreign Key Constraints ─────────────────────────────────────────────────

ALTER TABLE "JiraConnection"
  ADD CONSTRAINT "JiraConnection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowScope"
  ADD CONSTRAINT "FlowScope_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK enforces that connectionId belongs to the same workspace as the scope
ALTER TABLE "FlowScope"
  ADD CONSTRAINT "FlowScope_workspaceId_connectionId_fkey"
  FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "JiraConnection"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoardSnapshot"
  ADD CONSTRAINT "BoardSnapshot_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardSnapshot"
  ADD CONSTRAINT "BoardSnapshot_syncRunId_fkey"
  FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HoldDefinition"
  ADD CONSTRAINT "HoldDefinition_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyncRun"
  ADD CONSTRAINT "SyncRun_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkItem"
  ADD CONSTRAINT "WorkItem_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkItemLifecycleEvent"
  ADD CONSTRAINT "WorkItemLifecycleEvent_workItemId_fkey"
  FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HoldPeriod"
  ADD CONSTRAINT "HoldPeriod_workItemId_fkey"
  FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgingThresholdModel"
  ADD CONSTRAINT "AgingThresholdModel_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ForecastResultCache"
  ADD CONSTRAINT "ForecastResultCache_scopeId_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "FlowScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
