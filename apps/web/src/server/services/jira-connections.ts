import { JiraClientError } from '@agile-tools/jira-client';

/**
 * How long without a successful sync before a connection is considered stale.
 * Default: 48 hours.
 */
export const STALE_CONNECTION_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Map a thrown Jira client error (or unknown network error) to a canonical
 * error code string that can be persisted in `JiraConnection.lastErrorCode`.
 *
 * - `unauthorized` / `forbidden` → `JIRA_AUTH_ERROR`
 * - `not_found` → `JIRA_NOT_FOUND`
 * - other `JiraClientError` → `JIRA_HTTP_ERROR`
 * - `TypeError` (DNS/TLS/socket failures) → `JIRA_NETWORK_ERROR`
 * - anything else → `CONNECTION_FAILED`
 */
export function mapJiraConnectionErrorCode(err: unknown): string {
  if (err instanceof JiraClientError) {
    if (err.code === 'unauthorized' || err.code === 'forbidden') return 'JIRA_AUTH_ERROR';
    if (err.code === 'not_found') return 'JIRA_NOT_FOUND';
    return 'JIRA_HTTP_ERROR';
  }
  // p-retry may surface network errors as TypeError (fetch failures, DNS, TLS)
  if (err instanceof TypeError) return 'JIRA_NETWORK_ERROR';
  return 'CONNECTION_FAILED';
}

/**
 * Derive whether a connection should be considered stale based on how long
 * ago it last had a successful (healthy) sync.
 *
 * A connection is stale when `lastHealthyAt` is either null (never succeeded)
 * or older than `thresholdMs` milliseconds ago.
 *
 * This is evaluated at read time so that a healthy-persisted connection
 * naturally becomes stale without requiring a sync to trigger the transition.
 */
export function isConnectionStale(
  lastHealthyAt: Date | null,
  thresholdMs = STALE_CONNECTION_THRESHOLD_MS,
): boolean {
  if (!lastHealthyAt) return true;
  return Date.now() - lastHealthyAt.getTime() > thresholdMs;
}

/**
 * Compute the effective display health status for a connection, taking stale
 * time-based staleness into account at read time.
 *
 * - If persisted status is 'healthy' but the connection is stale → 'stale'
 * - All other persisted statuses are returned as-is.
 */
export function effectiveConnectionStatus(
  persistedStatus: string,
  lastHealthyAt: Date | null,
  thresholdMs = STALE_CONNECTION_THRESHOLD_MS,
): string {
  if (persistedStatus === 'healthy' && isConnectionStale(lastHealthyAt, thresholdMs)) {
    return 'stale';
  }
  return persistedStatus;
}
