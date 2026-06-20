import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { getPrismaClient, listFlowScopes, listJiraConnections } from '@agile-tools/db';
import { getAuthProvider, isHostedModeFromEnv } from '@agile-tools/shared';
import { getWorkspaceContext } from '@/server/auth';
import { getLocalDemoDefaultPath, isLocalDemoEnabled } from '@/server/dev-demo';
import { getLocalAdminDefaultPath, isLocalAdminBootstrapAvailable } from '@/server/local-bootstrap';
import { LocalBootstrapForm } from '@/components/app/demo-bootstrap-form';
import { BrandMark } from '@/components/app/brand-mark';
import { ScopeDirectory, type HomeScopeSummary } from '@/components/app/scope-directory';
import { buildJiraBoardUrl } from '@/lib/jira-links';
import { getAppBranding } from '@/server/branding';
import {
  buttonStyle,
  codeStyle,
  eyebrowStyle,
  heroCardStyle,
  heroCopyStyle,
  heroTitleStyle,
  itemCardStyle,
  pageShellStyle,
  palette,
  sectionCardStyle,
  sectionCopyStyle,
  sectionTitleStyle,
  statCardStyle,
  statGridStyle,
  statLabelStyle,
  statValueStyle,
} from '@/components/app/chrome';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const branding = getAppBranding();
  const authProvider = getAuthProvider();
  const hosted = isHostedModeFromEnv();
  const ctx = await getWorkspaceContext();
  const demoEnabled = isLocalDemoEnabled();
  const adminBootstrapEnabled = isLocalAdminBootstrapAvailable();

  if (!ctx) {
    if (hosted) {
      return (
        <main style={{ ...pageShellStyle, maxWidth: '1040px' }}>
          <section style={heroCardStyle}>
            <p style={eyebrowStyle}>Hosted Beta</p>
            <BrandMark branding={branding} heading style={{ margin: '0.9rem 0 0' }} />
            <p style={heroCopyStyle}>
              Sign in with Clerk, choose an organization, and create a hosted workspace before connecting Jira Cloud.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <SignInButton>
                <button type="button" style={buttonStyle('primary')}>Sign In</button>
              </SignInButton>
              <SignUpButton>
                <button type="button" style={buttonStyle('secondary')}>Sign Up</button>
              </SignUpButton>
              <a href="/onboarding" style={{ ...buttonStyle('secondary'), textDecoration: 'none' }}>
                Onboarding
              </a>
            </div>
          </section>
        </main>
      );
    }

    if (authProvider === 'oidc') {
      return (
        <main style={{ ...pageShellStyle, maxWidth: '1040px' }}>
          <section style={heroCardStyle}>
            <p style={eyebrowStyle}>Single Sign-On</p>
            <BrandMark branding={branding} heading style={{ margin: '0.9rem 0 0' }} />
            <p style={heroCopyStyle}>
              Sign in with your organization identity provider to open the workspace.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <a
                href="/api/oidc/login"
                style={{
                  ...buttonStyle('primary'),
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                }}
              >
                Sign in with SSO
              </a>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main style={{ ...pageShellStyle, maxWidth: '1040px' }}>
        <section style={heroCardStyle}>
          <p style={eyebrowStyle}>
            Local Entry
          </p>
          <h1 style={heroTitleStyle}>Kanban flow analytics and forecasting</h1>
          <p style={heroCopyStyle}>
            The working app routes in this feature are the Jira setup page, the scope analytics page, and the forecast page underneath a scope. This landing page exists to make local development and local image hosting usable when no workspace session is present yet.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            {demoEnabled && (
              <LocalBootstrapForm
                label="Open seeded demo scope →"
                nextPath={getLocalDemoDefaultPath()}
                mode="demo"
              />
            )}
            {adminBootstrapEnabled && (
              <LocalBootstrapForm
                label="Create local admin session and open Jira setup"
                nextPath={getLocalAdminDefaultPath()}
                mode="admin"
                variant={demoEnabled ? 'secondary' : 'primary'}
              />
            )}
          </div>
        </section>

        <section style={statGridStyle}>
          {[
            {
              title: 'Jira Setup',
              href: '/admin/jira',
              description: 'Connections, validation, and flow scope creation.',
            },
            ...(demoEnabled
              ? [
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
                ]
              : []),
          ].map((entry) => (
            <a
              key={entry.title}
              href={entry.href}
              style={{
                ...itemCardStyle,
                display: 'block',
                textDecoration: 'none',
                color: palette.text,
              }}
            >
              <h2 style={{ ...sectionTitleStyle, fontSize: '1.3rem' }}>{entry.title}</h2>
              <p style={{ ...sectionCopyStyle, marginTop: '0.5rem' }}>{entry.description}</p>
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
  const jiraBaseUrlByConnectionId = new Map(
    connections.map((connection) => [connection.id, connection.siteUrl ?? connection.baseUrl]),
  );
  const scopeSummaries: HomeScopeSummary[] = scopes.map((scope) => {
    const jiraBaseUrl = jiraBaseUrlByConnectionId.get(scope.connectionId);

    return {
      id: scope.id,
      boardId: scope.boardId,
      boardName: scope.boardName,
      timezone: scope.timezone,
      includedIssueTypeNames: scope.includedIssueTypeNames,
      syncIntervalMinutes: scope.syncIntervalMinutes,
      status: scope.status,
      jiraDashboardUrl: jiraBaseUrl ? buildJiraBoardUrl(jiraBaseUrl, scope.boardId) : null,
    };
  });

  return (
    <main style={{ ...pageShellStyle, maxWidth: '1040px' }}>
      <section style={heroCardStyle}>
        <p style={eyebrowStyle}>
          Workspace Home
        </p>
        <h1 style={heroTitleStyle}>
          {workspace?.name ?? branding.name}
        </h1>
        <p style={heroCopyStyle}>
          Signed in as {ctx.role} for workspace <span style={codeStyle}>{ctx.workspaceId}</span>.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          {ctx.role === 'admin' && (
            <a
              href="/admin/jira"
              style={{
                ...buttonStyle('primary'),
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              Open Jira setup
            </a>
          )}
          {demoEnabled && (
            <LocalBootstrapForm
              label="Reset local demo data"
              nextPath={getLocalDemoDefaultPath()}
              mode="demo"
              variant="secondary"
            />
          )}
          {authProvider === 'oidc' && (
            <form action="/api/oidc/logout" method="post" style={{ margin: 0 }}>
              <button type="submit" style={buttonStyle('secondary')}>
                Sign out
              </button>
            </form>
          )}
        </div>
      </section>

      <section style={statGridStyle}>
        <article style={statCardStyle}>
          <p style={statLabelStyle}>Connections</p>
          <p style={statValueStyle}>{connections.length}</p>
        </article>
        <article style={statCardStyle}>
          <p style={statLabelStyle}>Scopes</p>
          <p style={statValueStyle}>{scopes.length}</p>
        </article>
        <article style={statCardStyle}>
          <p style={statLabelStyle}>Timezone</p>
          <p style={{ ...statValueStyle, fontSize: '1.2rem' }}>{workspace?.defaultTimezone ?? 'Unknown'}</p>
        </article>
      </section>

      <section style={{ ...sectionCardStyle, marginTop: '1.5rem' }}>
        <ScopeDirectory workspaceId={ctx.workspaceId} scopes={scopeSummaries} />
      </section>
    </main>
  );
}
