import type { PrismaClient } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import { queryScopeFilterOptions } from '@agile-tools/db';
import { rebuildHoldPeriods } from './rebuild-hold-periods.js';
import { rebuildCurrentFlowProjection } from './rebuild-current-flow.js';

/**
 * Called after a scope sync succeeds to rebuild all projection data:
 * 1. Hold periods (on-hold state from lifecycle events + hold definition)
 * 2. Aging threshold model (percentile thresholds from completed story history)
 *
 * The rebuilt projections enable the flow analytics API to serve on-hold state,
 * aging zone classifications, and low-confidence warnings without re-computing
 * from raw events on every request.
 */
export async function rebuildScopeProjections(
  db: PrismaClient,
  scopeId: string,
  syncRunId: string,
): Promise<void> {
  await rebuildHoldPeriods(db, scopeId, syncRunId);

  const agingResult = await rebuildCurrentFlowProjection(db, scopeId, syncRunId);

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
    agingThresholdSampleSize: agingResult.sampleSize,
    agingLowConfidence: agingResult.lowConfidenceReason !== null,
  });
}
