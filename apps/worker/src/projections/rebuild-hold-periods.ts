import type { PrismaClient } from '@agile-tools/db';
import { getActiveHoldDefinition } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';

interface HoldPeriodInput {
  workItemId: string;
  startedAt: Date;
  endedAt: Date | null;
  source: 'status' | 'blocked_field';
  sourceValue: string;
}

/**
 * Rebuild HoldPeriod records for all work items in a scope using the scope's
 * active HoldDefinition.
 *
 * Deletes all existing hold periods for the scope and recomputes them from
 * stored WorkItemLifecycleEvent records.
 *
 * Called by rebuildScopeProjections after each successful sync run.
 *
 * Note: blocked_field holds require the "to" value of field-change events.
 * Since the current lifecycle event schema stores only changedFieldId (not
 * the changed value), blocked-field hold derivation is not yet implemented.
 * It will be addressed in a follow-up task when the schema is extended.
 */
export async function rebuildHoldPeriods(
  db: PrismaClient,
  scopeId: string,
  syncRunId: string,
): Promise<void> {
  const holdDef = await getActiveHoldDefinition(db, scopeId);

  if (!holdDef || holdDef.holdStatusIds.length === 0) {
    logger.info('No active hold definition — skipping hold period rebuild', {
      scopeId,
      syncRunId,
    });
    return;
  }

  const holdStatusIds = new Set(holdDef.holdStatusIds);

  // Load all non-excluded work items with their lifecycle events
  const workItems = await db.workItem.findMany({
    where: {
      scopeId,
      excludedReason: null,
    },
    select: {
      id: true,
      currentStatusId: true,
      createdAt: true,
      lifecycleEvents: {
        where: { eventType: 'status_change' },
        orderBy: { changedAt: 'asc' },
        select: {
          fromStatusId: true,
          toStatusId: true,
          changedAt: true,
        },
      },
    },
  });

  const derivedPeriods: HoldPeriodInput[] = [];

  for (const item of workItems) {
    const periods = deriveStatusHoldPeriods(
      { id: item.id, currentStatusId: item.currentStatusId, createdAt: item.createdAt },
      item.lifecycleEvents,
      holdStatusIds,
    );
    derivedPeriods.push(...periods);
  }

  // Rebuild in a transaction: delete existing and insert new hold periods
  await db.$transaction(async (tx) => {
    // Delete all existing hold periods for work items in this scope
    await tx.holdPeriod.deleteMany({
      where: {
        workItem: { scopeId },
      },
    });

    if (derivedPeriods.length > 0) {
      await tx.holdPeriod.createMany({ data: derivedPeriods });
    }
  });

  logger.info('Hold periods rebuilt', {
    scopeId,
    syncRunId,
    workItemCount: workItems.length,
    holdPeriodCount: derivedPeriods.length,
  });
}

// ─── Internal hold derivation ─────────────────────────────────────────────────

interface StatusChangeEvent {
  fromStatusId: string | null;
  toStatusId: string | null;
  changedAt: Date;
}

/**
 * Derive status-based hold periods for a single work item from its sorted
 * lifecycle events.
 *
 * A hold period opens when the item enters any hold status and closes when it
 * transitions out of all hold statuses. Hold → hold transitions (e.g., "On
 * Hold" → "Blocked" when both are configured as hold statuses) keep the period
 * open; the sourceValue records the status that originally opened it.
 *
 * For items whose current status is a hold status but with no recorded entry
 * transition, a synthetic open hold period is added starting from createdAt.
 */
function deriveStatusHoldPeriods(
  item: { id: string; currentStatusId: string; createdAt: Date },
  events: StatusChangeEvent[],
  holdStatusIds: Set<string>,
): HoldPeriodInput[] {
  const periods: HoldPeriodInput[] = [];

  // openSourceValue is non-null when a hold period is currently open
  let openStart: Date | null = null;
  let openSourceValue: string | null = null;

  for (const event of events) {
    const enteringHold = event.toStatusId != null && holdStatusIds.has(event.toStatusId);
    const leavingHold = event.fromStatusId != null && holdStatusIds.has(event.fromStatusId);

    if (enteringHold && !leavingHold) {
      // Transition from non-hold to hold
      if (openStart == null) {
        openStart = event.changedAt;
        openSourceValue = event.toStatusId!;
      }
    } else if (leavingHold && !enteringHold) {
      // Transition from hold to non-hold
      if (openStart != null) {
        periods.push({
          workItemId: item.id,
          startedAt: openStart,
          endedAt: event.changedAt,
          source: 'status',
          sourceValue: openSourceValue!,
        });
        openStart = null;
        openSourceValue = null;
      }
    }
    // hold → hold: keep the period open, sourceValue stays as the original entry
  }

  if (holdStatusIds.has(item.currentStatusId)) {
    // Item is currently in a hold status
    if (openStart != null) {
      // Normal case: hold period is already open from a recorded transition
      periods.push({
        workItemId: item.id,
        startedAt: openStart,
        endedAt: null,
        source: 'status',
        sourceValue: openSourceValue!,
      });
    } else {
      // No recorded transition into hold — item was likely created in this status
      periods.push({
        workItemId: item.id,
        startedAt: item.createdAt,
        endedAt: null,
        source: 'status',
        sourceValue: item.currentStatusId,
      });
    }
  } else if (openStart != null) {
    // Item left hold via a transition not captured in changelog (edge case)
    // Close the period at the last known event time
    const lastEvent = events[events.length - 1];
    periods.push({
      workItemId: item.id,
      startedAt: openStart,
      endedAt: lastEvent?.changedAt ?? null,
      source: 'status',
      sourceValue: openSourceValue!,
    });
  }

  return periods;
}
