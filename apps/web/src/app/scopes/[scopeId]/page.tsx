import { notFound } from 'next/navigation';
import { getWorkspaceContext } from '@/server/auth';
import { buildScopeSummary } from '@/server/views/scope-summary';
import { TriggerSyncButton } from '@/components/admin/trigger-sync-button';
import { HoldDefinitionForm } from '@/components/admin/hold-definition-form';
import { FlowAnalyticsSection } from '@/components/flow/flow-analytics-section';

export default async function ScopePage({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const ctx = await getWorkspaceContext();

  if (!ctx) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p>Authentication required. Please sign in.</p>
      </main>
    );
  }

  const { scopeId } = await params;
  const summary = await buildScopeSummary(ctx.workspaceId, scopeId);
  if (!summary) notFound();

  const { scope, connectionHealth, lastSync, filterOptions, warnings } = summary;

  const healthColor: Record<string, string> = {
    healthy: 'green',
    unhealthy: 'red',
    stale: '#b45309',
    validating: '#1d4ed8',
    draft: '#6b7280',
    disabled: '#6b7280',
  };

  const scopeStatusColor: Record<string, string> = {
    active: 'green',
    paused: '#b45309',
    needs_attention: 'red',
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>{scope.boardName ?? `Board ${scope.boardId}`}</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280' }}>
            Scope ID: <code>{scope.id}</code>
          </p>
        </div>
        <span
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            background: '#f3f4f6',
            color: scopeStatusColor[scope.status] ?? '#6b7280',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          {scope.status}
        </span>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: '4px',
          }}
        >
          <strong>⚠ Warnings</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Connection health */}
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Connection Health</h2>
        <p>
          Status:{' '}
          <strong style={{ color: healthColor[connectionHealth] ?? '#6b7280' }}>
            {connectionHealth}
          </strong>
        </p>
      </section>

      {/* Sync status */}
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Sync Status</h2>
        {lastSync ? (
          <div>
            <p>
              Last sync:{' '}
              <strong
                style={{
                  color:
                    lastSync.status === 'succeeded'
                      ? 'green'
                      : lastSync.status === 'failed'
                        ? 'red'
                        : '#1d4ed8',
                }}
              >
                {lastSync.status}
              </strong>
              {lastSync.finishedAt && (
                <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  (finished {new Date(lastSync.finishedAt).toLocaleString()})
                </span>
              )}
            </p>
            {lastSync.dataVersion && (
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Data version: <code>{lastSync.dataVersion}</code>
              </p>
            )}
            {lastSync.errorCode && (
              <p style={{ color: 'red', fontSize: '0.875rem' }}>
                Error: {lastSync.errorCode}
                {lastSync.errorSummary && ` — ${lastSync.errorSummary}`}
              </p>
            )}
          </div>
        ) : (
          <p>No sync runs yet.</p>
        )}
        {ctx.role === 'admin' && <TriggerSyncButton scopeId={scopeId} />}
      </section>

      {/* Flow analytics — only present after at least one successful sync */}
      {filterOptions && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Flow Analytics</h2>
          <FlowAnalyticsSection
            scopeId={scopeId}
            filterOptions={{
              ...(filterOptions.issueTypes !== undefined && { issueTypes: filterOptions.issueTypes }),
              ...(filterOptions.statuses !== undefined && { statuses: filterOptions.statuses }),
              ...(filterOptions.historicalWindows !== undefined && { historicalWindows: filterOptions.historicalWindows }),
            }}
          />
          {ctx.role === 'admin' && (
            <HoldDefinitionForm
              scopeId={scopeId}
              {...(filterOptions.statuses !== undefined && { availableStatuses: filterOptions.statuses })}
            />
          )}
        </section>
      )}

      {/* Scope configuration */}
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Configuration</h2>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: '1rem', color: '#6b7280' }}>Board ID</td>
              <td>{scope.boardId}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: '1rem', color: '#6b7280' }}>Timezone</td>
              <td>{scope.timezone}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: '1rem', color: '#6b7280' }}>Sync interval</td>
              <td>every {scope.syncIntervalMinutes} minutes</td>
            </tr>
            <tr>
              <td style={{ paddingRight: '1rem', color: '#6b7280', verticalAlign: 'top' }}>
                Issue types ({scope.includedIssueTypeIds.length})
              </td>
              <td>{scope.includedIssueTypeIds.join(', ')}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Navigation */}
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="/admin/jira" style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Jira Setup
        </a>
        {filterOptions && (
          <a href={`/scopes/${scopeId}/forecast`} style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '0.875rem' }}>
            📊 Forecast →
          </a>
        )}
      </div>
    </main>
  );
}
