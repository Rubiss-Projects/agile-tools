import type { PrismaClient } from '@agile-tools/db';
import { updateConnectionHealth } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';

/** Error codes that indicate a Jira auth or transport failure rather than a config issue. */
const JIRA_CONNECTION_ERROR_CODES = new Set<string>([
  'JIRA_AUTH_ERROR',
  'JIRA_HTTP_ERROR',
  'JIRA_NETWORK_ERROR',
]);

/**
 * How long without a successful sync before a connection should be marked stale.
 * Matches the threshold used by the web service layer.
 */
export const STALE_CONNECTION_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export interface SyncOutcome {
  succeeded: boolean;
  errorCode?: string | null;
}

/**
 * Update JiraConnection health fields after a scope sync completes.
 *
 * - Succeeded → healthy (clears last error, sets lastHealthyAt + lastValidatedAt)
 * - Failed with a Jira auth/HTTP/network error → unhealthy (records error code)
 * - Failed for any other reason (config error, drift, unexpected) → no health change,
 *   because the connection itself may still be functional.
 *
 * After the outcome is applied, also checks whether the connection has gone
 * stale (no healthy sync within STALE_CONNECTION_THRESHOLD_MS) and emits an
 * alert log so operators are notified even before a periodic sweeper runs.
 */
export async function updateConnectionHealthAfterSync(
  db: PrismaClient,
  workspaceId: string,
  connectionId: string,
  outcome: SyncOutcome,
): Promise<void> {
  const now = new Date();

  if (outcome.succeeded) {
    await updateConnectionHealth(db, workspaceId, connectionId, {
      healthStatus: 'healthy',
      lastValidatedAt: now,
      lastHealthyAt: now,
      lastErrorCode: null,
    });
    logger.debug('Connection health updated to healthy after successful sync', { connectionId });
    return;
  }

  if (outcome.errorCode && JIRA_CONNECTION_ERROR_CODES.has(outcome.errorCode)) {
    await updateConnectionHealth(db, workspaceId, connectionId, {
      healthStatus: 'unhealthy',
      lastValidatedAt: now,
      lastErrorCode: outcome.errorCode,
    });
    logger.warn('Connection health updated to unhealthy after sync failure', {
      connectionId,
      errorCode: outcome.errorCode,
    });
    return;
  }
  // Non-connection failures (SCOPE_NOT_FOUND, BOARD_DRIFT_DETECTED, UNEXPECTED_ERROR, etc.)
  // do not change the connection health — the Jira link may still be functional.
}

/**
 * Emit a stale-connection alert log for a connection whose `lastHealthyAt` has
 * not been updated within STALE_CONNECTION_THRESHOLD_MS.
 *
 * This is called opportunistically during sync scheduling so operators see an
 * alert even before a periodic health sweeper runs.  It does NOT write to the
 * database — use `updateConnectionHealth` to persist the `stale` status.
 */
export function alertIfConnectionIsStale(
  connectionId: string,
  lastHealthyAt: Date | null,
  thresholdMs = STALE_CONNECTION_THRESHOLD_MS,
): boolean {
  const isStale =
    !lastHealthyAt || Date.now() - lastHealthyAt.getTime() > thresholdMs;

  if (isStale) {
    logger.warn('Jira connection has not had a successful sync within the staleness threshold', {
      connectionId,
      lastHealthyAt: lastHealthyAt?.toISOString() ?? null,
      thresholdHours: thresholdMs / (60 * 60 * 1000),
    });
  }

  return isStale;
}
