import type { PrismaClient } from '@agile-tools/db';
import { updateConnectionHealth } from '@agile-tools/db';
import { logger } from '@agile-tools/shared';

/** Error codes that indicate a Jira auth or transport failure rather than a config issue. */
const JIRA_CONNECTION_ERROR_CODES = new Set<string>(['JIRA_AUTH_ERROR', 'JIRA_HTTP_ERROR']);

export interface SyncOutcome {
  succeeded: boolean;
  errorCode?: string | null;
}

/**
 * Update JiraConnection health fields after a scope sync completes.
 *
 * - Succeeded → healthy (clears last error, sets lastHealthyAt + lastValidatedAt)
 * - Failed with a Jira auth/HTTP error → unhealthy (records error code)
 * - Failed for any other reason (config error, drift, unexpected) → no health change,
 *   because the connection itself may still be functional.
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
  }
  // Non-connection failures (SCOPE_NOT_FOUND, BOARD_DRIFT_DETECTED, UNEXPECTED_ERROR, etc.)
  // do not change the connection health — the Jira link may still be functional.
}
