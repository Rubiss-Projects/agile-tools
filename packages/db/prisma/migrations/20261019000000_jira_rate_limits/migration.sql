ALTER TABLE "JiraConnection" ADD COLUMN "requestBudgetPerMinute" INTEGER, ADD COLUMN "activeSyncRunId" TEXT, ADD COLUMN "syncLeaseUntil" TIMESTAMP(3);
ALTER TABLE "JiraConnection" ADD COLUMN "activeSyncLeaseToken" TEXT;
ALTER TABLE "FlowScope" ADD COLUMN "nextSyncAt" TIMESTAMP(3), ADD COLUMN "lastFullSyncAt" TIMESTAMP(3), ADD COLUMN "permanentFailureCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastSyncError" TEXT;
ALTER TABLE "SyncRun" ADD COLUMN "resumeAfter" TIMESTAMP(3), ADD COLUMN "fullResync" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "JiraRateLimitState" (
 "connectionId" TEXT PRIMARY KEY REFERENCES "JiraConnection"("id") ON DELETE CASCADE,
 "state" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "JiraRequestDay" (
 "connectionId" TEXT NOT NULL REFERENCES "JiraConnection"("id") ON DELETE CASCADE,
 "scopeId" TEXT NOT NULL, "day" DATE NOT NULL, "requests" INTEGER NOT NULL DEFAULT 0,
 "rateLimited" INTEGER NOT NULL DEFAULT 0, PRIMARY KEY ("connectionId", "scopeId", "day")
);
CREATE TABLE "JiraIssueCache" (
 "connectionId" TEXT NOT NULL REFERENCES "JiraConnection"("id") ON DELETE CASCADE,
 "jiraIssueId" TEXT NOT NULL, "jiraUpdatedAt" TEXT NOT NULL, "changelog" JSONB NOT NULL,
 "latestComment" JSONB NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("connectionId", "jiraIssueId")
);
