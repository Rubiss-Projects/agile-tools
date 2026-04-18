import { redirect } from 'next/navigation';
import { getPrismaClient, listJiraConnections, listFlowScopes } from '@agile-tools/db';
import { getWorkspaceContext } from '@/server/auth';
import { mapConnection } from '@/app/api/v1/admin/jira-connections/_lib';
import { mapScope } from '@/app/api/v1/admin/scopes/_lib';
import { JiraConnectionForm, ValidateConnectionButton } from '@/components/admin/jira-connection-form';
import { FlowScopeForm } from '@/components/admin/flow-scope-form';

export default async function AdminJiraPage() {
  const ctx = await getWorkspaceContext();

  if (!ctx) redirect('/');
  if (ctx.role !== 'admin') {
    return (
      <main style={{ padding: '2rem' }}>
        <p style={{ color: 'red' }}>Access denied. Administrator access is required.</p>
      </main>
    );
  }

  const db = getPrismaClient();
  const [connections, scopes] = await Promise.all([
    listJiraConnections(db, ctx.workspaceId),
    listFlowScopes(db, ctx.workspaceId),
  ]);

  const connectionSummaries = connections.map(mapConnection);
  const scopeSummaries = scopes.map(mapScope);

  const healthBadgeColor: Record<string, string> = {
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
      <h1>Jira Setup</h1>

      {/* ── Connections ─────────────────────────────────────────────── */}
      <section>
        <h2>Connections</h2>
        {connectionSummaries.length === 0 ? (
          <p>No Jira connections configured yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {connectionSummaries.map((conn) => (
              <li
                key={conn.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                }}
              >
                <strong>{conn.displayName ?? conn.baseUrl}</strong>
                <span
                  style={{
                    marginLeft: '0.75rem',
                    color: healthBadgeColor[conn.healthStatus] ?? '#6b7280',
                    fontWeight: 600,
                  }}
                >
                  {conn.healthStatus}
                </span>
                {conn.lastErrorCode && (
                  <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    (error: {conn.lastErrorCode})
                  </span>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  <ValidateConnectionButton connectionId={conn.id} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <JiraConnectionForm />
      </section>

      {/* ── Flow Scopes ──────────────────────────────────────────────── */}
      <section style={{ marginTop: '2rem' }}>
        <h2>Flow Scopes</h2>
        {scopeSummaries.length === 0 ? (
          <p>No flow scopes configured yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {scopeSummaries.map((scope) => (
              <li
                key={scope.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  <strong>{scope.boardName ?? `Board ${scope.boardId}`}</strong>
                  <span
                    style={{
                      marginLeft: '0.75rem',
                      color: scopeStatusColor[scope.status] ?? '#6b7280',
                      fontWeight: 600,
                    }}
                  >
                    {scope.status}
                  </span>
                  <span style={{ marginLeft: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    — every {scope.syncIntervalMinutes} min
                  </span>
                </span>
                <a href={`/scopes/${scope.id}`} style={{ textDecoration: 'none', color: '#1d4ed8' }}>
                  View →
                </a>
              </li>
            ))}
          </ul>
        )}

        {connectionSummaries.length > 0 && (
          <FlowScopeForm connections={connectionSummaries} />
        )}
        {connectionSummaries.length === 0 && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Add a Jira connection before creating a flow scope.
          </p>
        )}
      </section>
    </main>
  );
}
