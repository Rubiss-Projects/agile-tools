-- ─── Status ID label resolution index ────────────────────────────────────────
--
-- Supports the per-request label hydration query that resolves human-readable
-- status names from sibling work items for a given scope:
--   WHERE scopeId = $1 AND currentStatusId IN (...)
--
-- Without this index the query requires a full scope-partition scan on scopes
-- with many retained work items, violating the p95 < 500 ms read goal.
CREATE INDEX "WorkItem_scopeId_currentStatusId_idx"
  ON "WorkItem"("scopeId", "currentStatusId");
