-- ─── Projection Query Performance Indexes ─────────────────────────────────────
--
-- These indexes target the hot query paths identified during Phase 6 performance
-- validation. Baseline query shapes were profiled against realistic data volumes
-- (500+ active work items, 24 months of lifecycle history).

-- ─── Current flow view (queryCurrentWorkItems) ───────────────────────────────
--
-- Filters: scopeId, completedAt IS NULL, excludedReason IS NULL,
--          optional lastSyncRunId (dataVersion pin)
-- Order by: startedAt ASC
--
-- Replaces the earlier partial active-items index with a richer covering variant
-- that includes lastSyncRunId and startedAt so dataVersion-pinned scatter-plot
-- queries can be resolved without a heap fetch.
CREATE INDEX "WorkItem_scopeId_lastSyncRunId_active_idx"
  ON "WorkItem"("scopeId", "lastSyncRunId", "startedAt")
  WHERE "completedAt" IS NULL AND "excludedReason" IS NULL;

-- ─── Throughput / forecast path (queryDailyThroughput, queryCompletedStories) ─
--
-- Filters: scopeId, completedAt IS NOT NULL AND >= windowStart,
--          excludedReason IS NULL, optional lastSyncRunId
-- Order by: completedAt ASC
--
-- Covering partial index so the forecast warm-path (queryDailyThroughput) can
-- satisfy the entire query from the index without a heap scan.
CREATE INDEX "WorkItem_scopeId_lastSyncRunId_completed_idx"
  ON "WorkItem"("scopeId", "lastSyncRunId", "completedAt")
  WHERE "completedAt" IS NOT NULL AND "excludedReason" IS NULL;

-- ─── Forecast cache cleanup ────────────────────────────────────────────────────
--
-- Partial index on expiresAt so an opportunistic DELETE … WHERE expiresAt < now()
-- can be satisfied with an index range scan rather than a full-table scan.
CREATE INDEX "ForecastResultCache_expiresAt_idx"
  ON "ForecastResultCache"("expiresAt")
  WHERE "expiresAt" IS NOT NULL;
