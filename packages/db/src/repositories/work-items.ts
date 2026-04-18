import type { PrismaClient, WorkItem, WorkItemLifecycleEvent, HoldPeriod } from '@prisma/client';

export type WorkItemWithDetail = WorkItem & {
  lifecycleEvents: WorkItemLifecycleEvent[];
  holdPeriods: HoldPeriod[];
};

/**
 * Fetch a single work item with its lifecycle events and hold periods.
 * Scoped to the given scopeId so cross-scope access is prevented.
 * Returns null if the item does not exist within the scope.
 */
export async function getWorkItemWithDetail(
  db: PrismaClient,
  scopeId: string,
  workItemId: string,
): Promise<WorkItemWithDetail | null> {
  return db.workItem.findFirst({
    where: { id: workItemId, scopeId },
    include: {
      lifecycleEvents: { orderBy: { changedAt: 'asc' } },
      holdPeriods: { orderBy: { startedAt: 'asc' } },
    },
  });
}
