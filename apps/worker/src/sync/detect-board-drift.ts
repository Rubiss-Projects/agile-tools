import type { PrismaClient } from '@agile-tools/db';
import { updateFlowScopeStatus } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';
import type { BoardDiscoveryDetail } from '@agile-tools/shared/contracts/api';

export interface DriftReport {
  /** startStatusIds configured on the scope that no longer exist in the board. */
  missingStartStatuses: string[];
  /** doneStatusIds configured on the scope that no longer exist in the board. */
  missingDoneStatuses: string[];
}

interface ScopeStatusConfig {
  id: string;
  workspaceId: string;
  boardId: string;
  startStatusIds: string[];
  doneStatusIds: string[];
}

/**
 * Compare a scope's configured status IDs against the live board layout.
 * Returns a DriftReport if any scope status IDs are missing from the board, or null if clean.
 */
export function detectBoardDrift(
  scope: ScopeStatusConfig,
  boardDetail: BoardDiscoveryDetail,
): DriftReport | null {
  const boardStatusIds = new Set(boardDetail.columns.flatMap((col) => col.statusIds));
  const completionStatusIds = new Set(
    (boardDetail.completionStatuses ?? boardDetail.statuses).map((status) => status.id),
  );

  const missingStartStatuses = scope.startStatusIds.filter((id) => !boardStatusIds.has(id));
  const missingDoneStatuses = scope.doneStatusIds.filter((id) => !completionStatusIds.has(id));

  if (missingStartStatuses.length > 0 || missingDoneStatuses.length > 0) {
    return { missingStartStatuses, missingDoneStatuses };
  }

  return null;
}

/**
 * Mark the scope as `needs_attention` when board drift is detected.
 * Callers are responsible for canceling the in-flight sync after calling this.
 */
export async function applyBoardDriftHandling(
  db: PrismaClient,
  scope: ScopeStatusConfig,
  driftReport: DriftReport,
): Promise<void> {
  await updateFlowScopeStatus(db, scope.workspaceId, scope.id, 'needs_attention');

  logger.warn('Board drift detected — scope marked as needs_attention; sync canceled', {
    scopeId: scope.id,
    boardId: scope.boardId,
    missingStartStatuses: driftReport.missingStartStatuses,
    missingDoneStatuses: driftReport.missingDoneStatuses,
  });
}
