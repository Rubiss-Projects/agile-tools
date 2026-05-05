CREATE TABLE "SyncWorkItemStage" (
  "id"                TEXT NOT NULL,
  "syncRunId"         TEXT NOT NULL,
  "scopeId"           TEXT NOT NULL,
  "jiraIssueId"       TEXT NOT NULL,
  "issueKey"          TEXT NOT NULL,
  "summary"           TEXT NOT NULL,
  "issueTypeId"       TEXT NOT NULL,
  "issueTypeName"     TEXT,
  "projectId"         TEXT NOT NULL,
  "currentStatusId"   TEXT NOT NULL,
  "currentStatusName" TEXT,
  "currentColumn"     TEXT,
  "assigneeName"      TEXT,
  "jiraCreatedAt"     TIMESTAMP(3) NOT NULL,
  "startedAt"         TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),
  "reopenedCount"     INTEGER NOT NULL DEFAULT 0,
  "directUrl"         TEXT NOT NULL,
  "excludedReason"    TEXT,
  "lifecycleEvents"   JSONB NOT NULL,
  "stagedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncWorkItemStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncWorkItemStage_syncRunId_jiraIssueId_key"
  ON "SyncWorkItemStage"("syncRunId", "jiraIssueId");

CREATE INDEX "SyncWorkItemStage_syncRunId_id_idx"
  ON "SyncWorkItemStage"("syncRunId", "id");

CREATE INDEX "SyncWorkItemStage_scopeId_syncRunId_idx"
  ON "SyncWorkItemStage"("scopeId", "syncRunId");

ALTER TABLE "SyncWorkItemStage"
  ADD CONSTRAINT "SyncWorkItemStage_syncRunId_fkey"
  FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
