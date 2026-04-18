import type { PrismaClient } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { queryScopeFilterOptions } from '@agile-tools/db';

/**
 * Called after a scope sync succeeds to validate projection data and emit
 * diagnostic metrics for the completed sync.
 *
 * For US1, this is a lightweight hook (no materialized writes) that provides
 * the extension point used in later stories (T025) to rebuild enriched
 * read models (hold periods, aging zones) after each sync.
 */
export async function rebuildScopeProjections(
  db: PrismaClient,
  scopeId: string,
  syncRunId: string,
): Promise<void> {
  // Count active items pinned to this sync run to detect unexpected data gaps.
  const activeCount = await db.workItem.count({
    where: { scopeId, completedAt: null, excludedReason: null, lastSyncRunId: syncRunId },
  });

  const completedCount = await db.workItem.count({
    where: { scopeId, completedAt: { not: null }, lastSyncRunId: syncRunId },
  });

  const filterOptions = await queryScopeFilterOptions(db, scopeId, { dataVersion: syncRunId });

  logger.info('Scope projections ready', {
    scopeId,
    syncRunId,
    activeItemCount: activeCount,
    completedItemCount: completedCount,
    distinctIssueTypes: filterOptions.issueTypes.length,
    distinctStatuses: filterOptions.statuses.length,
  });
}
