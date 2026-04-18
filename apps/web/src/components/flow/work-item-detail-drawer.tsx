'use client';

import { useState, useEffect } from 'react';
import type { WorkItemDetail } from '@agile-tools/shared/contracts/api';

interface WorkItemDetailDrawerProps {
  scopeId: string;
  workItemId: string | null;
  issueKey?: string;
  onClose: () => void;
}

export function WorkItemDetailDrawer({
  scopeId,
  workItemId,
  issueKey,
  onClose,
}: WorkItemDetailDrawerProps) {
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workItemId) {
      setDetail(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(`/api/v1/scopes/${scopeId}/items/${workItemId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WorkItemDetail>;
      })
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load item detail.');
        setLoading(false);
      });
  }, [scopeId, workItemId]);

  if (!workItemId) return null;

  return (
    <div
      role="dialog"
      aria-label={`Work item detail: ${issueKey ?? workItemId}`}
      style={{
        position: 'fixed',
        inset: '0 0 0 auto',
        width: '24rem',
        background: 'white',
        borderLeft: '1px solid #e5e7eb',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        overflowY: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{issueKey ?? 'Work Item'}</h3>
        <button
          onClick={onClose}
          aria-label="Close detail drawer"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.25rem',
            color: '#6b7280',
            lineHeight: 1,
            padding: '0.25rem',
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', fontSize: '0.875rem' }}>
        {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {detail && <WorkItemDetailContent detail={detail} />}
      </div>
    </div>
  );
}

function WorkItemDetailContent({ detail }: { detail: WorkItemDetail }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{detail.summary}</p>
      <p style={{ margin: '0 0 0.25rem', color: '#6b7280' }}>
        Status:{' '}
        <strong style={{ color: '#111827' }}>{detail.currentStatus}</strong>
      </p>
      <p style={{ margin: '0 0 0.25rem', color: '#6b7280' }}>
        Age:{' '}
        <strong style={{ color: '#111827' }}>{detail.ageDays.toFixed(1)} days</strong>
      </p>
      {detail.jiraUrl && (
        <p style={{ margin: '0 0 1rem' }}>
          <a
            href={detail.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#1d4ed8' }}
          >
            View in Jira ↗
          </a>
        </p>
      )}

      {detail.holdPeriods.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#374151' }}>
            Hold Periods ({detail.holdPeriods.length})
          </h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {detail.holdPeriods.map((hp, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>
                {new Date(hp.startedAt).toLocaleDateString()}
                {hp.endedAt
                  ? ` – ${new Date(hp.endedAt).toLocaleDateString()}`
                  : ' – present'}
                {hp.sourceValue && (
                  <span style={{ color: '#6b7280' }}> ({hp.sourceValue})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.lifecycleEvents.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#374151' }}>
            Timeline ({detail.lifecycleEvents.length} events)
          </h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem' }}>
            {detail.lifecycleEvents.map((ev, i) => (
              <li key={i} style={{ marginBottom: '0.25rem', color: '#6b7280' }}>
                {new Date(ev.changedAt).toLocaleDateString()}{' '}
                <span style={{ color: '#111827' }}>{ev.eventType}</span>
                {ev.fromStatus && ev.toStatus && ` : ${ev.fromStatus} → ${ev.toStatus}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
