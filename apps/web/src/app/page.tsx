import { getPrismaClient, listFlowScopes, listJiraConnections } from '@agile-tools/db';
import { getWorkspaceContext } from '@/server/auth';
import { getLocalDemoDefaultPath, isLocalDemoEnabled } from '@/server/dev-demo';
import { DemoBootstrapForm } from '@/components/app/demo-bootstrap-form';

export default async function HomePage() {
  const ctx = await getWorkspaceContext();

  if (!ctx) {
    return (
      <main style={{ padding: '3rem 1.5rem', maxWidth: '960px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <section
          style={{
            padding: '2rem',
            borderRadius: '24px',
            background: 'linear-gradient(140deg, #fff7ed 0%, #eff6ff 55%, #ecfeff 100%)',
            border: '1px solid #e2e8f0',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.1em', color: '#9a3412', textTransform: 'uppercase' }}>
            Local Entry
          </p>
          <h1 style={{ margin: '0.75rem 0 0', fontSize: '2.25rem', lineHeight: 1.1 }}>Kanban flow analytics and forecasting</h1>
          <p style={{ margin: '1rem 0 0', maxWidth: '46rem', color: '#334155', lineHeight: 1.7 }}>
            The working app routes in this feature are the Jira setup page, the scope analytics page, and the forecast page underneath a scope. This landing page exists to make local development usable when no workspace session is present yet.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            {isLocalDemoEnabled() && (
              <DemoBootstrapForm
                label="Open seeded demo scope →"
                nextPath={getLocalDemoDefaultPath()}
              />
            )}
            {isLocalDemoEnabled() && (
              <DemoBootstrapForm
                label="Seed demo and open Jira setup"
                nextPath="/admin/jira"
                variant="secondary"
              />
            )}
          </div>
        </section>

        <section style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[
            {
              title: 'Jira Setup',
              href: '/admin/jira',
              description: 'Connections, validation, and flow scope creation.',
            },
            {
              title: 'Scope Analytics',
              href: getLocalDemoDefaultPath(),
              description: 'Connection health, sync status, aging scatter plot, and hold rules.',
            },
            {
              title: 'Forecast',
              href: `${getLocalDemoDefaultPath()}/forecast`,
              description: 'Historical throughput plus Monte Carlo forecasts.',
            },
          ].map((entry) => (
            <a
              key={entry.title}
              href={entry.href}
              style={{
                display: 'block',
                padding: '1.25rem',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                textDecoration: 'none',
                color: '#0f172a',
                background: 'white',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{entry.title}</h2>
              <p style={{ margin: '0.5rem 0 0', color: '#475569', lineHeight: 1.6 }}>{entry.description}</p>
            </a>
          ))}
        </section>
      </main>
    );
  }

  const db = getPrismaClient();
  const [workspace, connections, scopes] = await Promise.all([
    db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { name: true, defaultTimezone: true },
    }),
    listJiraConnections(db, ctx.workspaceId),
    listFlowScopes(db, ctx.workspaceId),
  ]);

  return (
    <main style={{ padding: '3rem 1.5rem', maxWidth: '960px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <section
        style={{
          padding: '2rem',
          borderRadius: '24px',
          background: 'linear-gradient(140deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)',
          border: '1px solid #e2e8f0',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase' }}>
          Workspace Home
        </p>
        <h1 style={{ margin: '0.75rem 0 0', fontSize: '2.25rem', lineHeight: 1.1 }}>
          {workspace?.name ?? 'Agile Tools'}
        </h1>
        <p style={{ margin: '0.75rem 0 0', color: '#475569' }}>
          Signed in as {ctx.role} for workspace {ctx.workspaceId}.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          <a
            href="/admin/jira"
            style={{
              padding: '0.8rem 1rem',
              borderRadius: '9999px',
              background: '#0f172a',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open Jira setup
          </a>
          {isLocalDemoEnabled() && (
            <DemoBootstrapForm
              label="Reset local demo data"
              nextPath={getLocalDemoDefaultPath()}
              variant="secondary"
            />
          )}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article style={{ padding: '1.25rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: 'white' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Connections</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '2rem', fontWeight: 700 }}>{connections.length}</p>
        </article>
        <article style={{ padding: '1.25rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: 'white' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scopes</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '2rem', fontWeight: 700 }}>{scopes.length}</p>
        </article>
        <article style={{ padding: '1.25rem', borderRadius: '18px', border: '1px solid #e2e8f0', background: 'white' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timezone</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 700 }}>{workspace?.defaultTimezone ?? 'Unknown'}</p>
        </article>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Available scopes</h2>
        {scopes.length === 0 ? (
          <p style={{ color: '#475569' }}>No scopes are configured in this workspace yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {scopes.map((scope) => (
              <div
                key={scope.id}
                style={{
                  padding: '1.25rem',
                  borderRadius: '18px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>{scope.boardName}</h3>
                  <p style={{ margin: '0.5rem 0 0', color: '#475569' }}>
                    Board {scope.boardId} · every {scope.syncIntervalMinutes} minutes · {scope.status}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <a href={`/scopes/${scope.id}`} style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
                    Scope →
                  </a>
                  <a href={`/scopes/${scope.id}/forecast`} style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
                    Forecast →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}