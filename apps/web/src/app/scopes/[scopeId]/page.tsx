import { notFound } from 'next/navigation';
import { getWorkspaceContext } from '@/server/auth';
import { buildScopeSummary } from '@/server/views/scope-summary';
import { TriggerSyncButton } from '@/components/admin/trigger-sync-button';
import { HoldDefinitionForm } from '@/components/admin/hold-definition-form';
import { FlowAnalyticsSection } from '@/components/flow/flow-analytics-section';
import { AuthRequiredPanel } from '@/components/app/auth-required-panel';
import {
  codeStyle,
  eyebrowStyle,
  heroCardStyle,
  heroCopyStyle,
  heroTitleStyle,
  noticeStyle,
  pageShellStyle,
  sectionCardStyle,
  sectionCopyStyle,
  sectionHeaderRowStyle,
  sectionStackStyle,
  sectionTitleStyle,
  statCardStyle,
  statGridStyle,
  statLabelStyle,
  statValueStyle,
  tonePillStyle,
  linkStyle,
  insetPanelStyle,
} from '@/components/app/chrome';

export default async function ScopePage({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const { scopeId } = await params;
  const ctx = await getWorkspaceContext();

  if (!ctx) {
    return (
      <AuthRequiredPanel
        title="Scope analytics require a workspace session"
        description="This route only works inside a workspace context. In local development you can seed a demo workspace and land straight back on this scope."
        nextPath={`/scopes/${scopeId}`}
      />
    );
  }

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

  const connectionTone = connectionHealth === 'healthy'
    ? 'positive'
    : connectionHealth === 'stale'
      ? 'warning'
      : connectionHealth === 'unhealthy'
        ? 'danger'
        : connectionHealth === 'validating'
          ? 'info'
          : 'neutral';

  const scopeTone = scope.status === 'active'
    ? 'positive'
    : scope.status === 'paused'
      ? 'warning'
      : scope.status === 'needs_attention'
        ? 'danger'
        : 'neutral';

  return (
    <main style={pageShellStyle}>
      <section style={heroCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={eyebrowStyle}>Flow Scope</p>
            <h1 style={heroTitleStyle}>{scope.boardName ?? `Board ${scope.boardId}`}</h1>
            <p style={heroCopyStyle}>
              Track active work, sync health, and aging signals for this board snapshot.
            </p>
            <p style={{ margin: '0.9rem 0 0', color: '#475569', fontSize: '0.92rem' }}>
              Scope ID <span style={codeStyle}>{scope.id}</span>
            </p>
          </div>
          <span style={tonePillStyle(scopeTone)}>{scope.status}</span>
        </div>

        <div style={statGridStyle}>
          <article style={statCardStyle}>
            <p style={statLabelStyle}>Connection Health</p>
            <p style={{ ...statValueStyle, color: healthColor[connectionHealth] ?? '#0f172a' }}>{connectionHealth}</p>
          </article>
          <article style={statCardStyle}>
            <p style={statLabelStyle}>Last Sync</p>
            <p style={{ ...statValueStyle, fontSize: '1rem' }}>
              {lastSync?.finishedAt ? new Date(lastSync.finishedAt).toLocaleString() : 'No sync yet'}
            </p>
          </article>
          <article style={statCardStyle}>
            <p style={statLabelStyle}>Timezone</p>
            <p style={statValueStyle}>{scope.timezone}</p>
          </article>
          <article style={statCardStyle}>
            <p style={statLabelStyle}>Cadence</p>
            <p style={statValueStyle}>Every {scope.syncIntervalMinutes}m</p>
          </article>
        </div>
      </section>

      <div style={sectionStackStyle}>
        {warnings.length > 0 && (
          <section style={noticeStyle('warning')}>
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Warnings</strong>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {warnings.map((w, i) => (
                <p key={i} style={{ margin: 0 }}>{w.message}</p>
              ))}
            </div>
          </section>
        )}

        <section style={sectionCardStyle}>
          <div style={sectionHeaderRowStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Connection and sync</h2>
              <p style={sectionCopyStyle}>Current health, most recent sync outcome, and the active snapshot identifier.</p>
            </div>
            <span style={tonePillStyle(connectionTone)}>{connectionHealth}</span>
          </div>

        {lastSync ? (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div style={insetPanelStyle}>
              <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                Last sync{' '}
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
                  <span style={{ marginLeft: '0.45rem', color: '#64748b' }}>
                    finished {new Date(lastSync.finishedAt).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
            {lastSync.dataVersion && (
              <div style={insetPanelStyle}>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                  Data version <span style={codeStyle}>{lastSync.dataVersion}</span>
                </p>
              </div>
            )}
            {lastSync.errorCode && (
              <p style={{ margin: 0, color: 'red', fontSize: '0.875rem' }}>
                Error: {lastSync.errorCode}
                {lastSync.errorSummary && ` — ${lastSync.errorSummary}`}
              </p>
            )}
          </div>
        ) : (
          <p style={sectionCopyStyle}>No sync runs yet.</p>
        )}
        {ctx.role === 'admin' && <TriggerSyncButton scopeId={scopeId} />}
        </section>

        {filterOptions && (
          <section style={sectionCardStyle}>
            <div style={sectionHeaderRowStyle}>
              <div>
                <h2 style={sectionTitleStyle}>Flow analytics</h2>
                <p style={sectionCopyStyle}>Use the filters to focus the aging view on specific statuses, issue types, or blocked work.</p>
              </div>
            </div>
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

        <section style={sectionCardStyle}>
          <div style={sectionHeaderRowStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Configuration</h2>
              <p style={sectionCopyStyle}>The scope definition below controls what is included in cycle time, throughput, and forecast calculations.</p>
            </div>
          </div>
          <div style={statGridStyle}>
            <article style={statCardStyle}>
              <p style={statLabelStyle}>Board ID</p>
              <p style={statValueStyle}>{scope.boardId}</p>
            </article>
            <article style={statCardStyle}>
              <p style={statLabelStyle}>Timezone</p>
              <p style={statValueStyle}>{scope.timezone}</p>
            </article>
            <article style={statCardStyle}>
              <p style={statLabelStyle}>Sync Interval</p>
              <p style={statValueStyle}>{scope.syncIntervalMinutes} min</p>
            </article>
            <article style={statCardStyle}>
              <p style={statLabelStyle}>Issue Types</p>
              <p style={{ ...statValueStyle, fontSize: '0.98rem', lineHeight: 1.4 }}>{scope.includedIssueTypeIds.join(', ')}</p>
            </article>
          </div>
        </section>

        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/admin/jira" style={linkStyle}>
          ← Back to Jira Setup
        </a>
        {filterOptions && (
          <a href={`/scopes/${scopeId}/forecast`} style={linkStyle}>
            📊 Forecast →
          </a>
        )}
        </div>
      </div>
    </main>
  );
}
