'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { JiraConnection } from '@agile-tools/shared/contracts/api';
import {
  buttonStyle,
  fieldLabelStyle,
  helperTextStyle,
  inputStyle,
  insetPanelStyle,
  noticeStyle,
  sectionCopyStyle,
  sectionTitleStyle,
  tonePillStyle,
} from '@/components/app/chrome';

// ─── Create Connection Form ───────────────────────────────────────────────────

export function JiraConnectionForm() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState('');
  const [pat, setPat] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<JiraConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/jira-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          pat,
          ...(displayName.trim() && { displayName: displayName.trim() }),
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError((data as { message?: string }).message ?? 'Failed to create connection.');
      } else {
        setCreated(data as JiraConnection);
        setBaseUrl('');
        setPat('');
        setDisplayName('');
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ ...insetPanelStyle, marginTop: '1rem' }}>
      <h3 style={{ ...sectionTitleStyle, marginBottom: '0.35rem' }}>Add Jira Connection</h3>
      <p style={{ ...sectionCopyStyle, marginBottom: '1rem' }}>
        Store the Jira base URL and PAT used for board discovery and scheduled syncs.
      </p>
      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            <span style={fieldLabelStyle}>Jira Base URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://jira.example.com"
              required
              style={inputStyle}
            />
          </label>
          <p style={helperTextStyle}>Use the root Jira URL for the Data Center instance you want to query.</p>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            <span style={fieldLabelStyle}>Personal Access Token</span>
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            <span style={fieldLabelStyle}>Display Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. My Team Jira"
              style={inputStyle}
            />
          </label>
          <p style={helperTextStyle}>Optional label used to distinguish multiple Jira instances in the workspace.</p>
        </div>
        {error && <div style={{ ...noticeStyle('danger'), marginBottom: '0.75rem' }}><p style={{ margin: 0 }}>{error}</p></div>}
        <button type="submit" disabled={submitting} style={buttonStyle('primary', submitting)}>
          {submitting ? 'Creating…' : 'Create Connection'}
        </button>
      </form>
      {created && (
        <div style={{ ...noticeStyle('success'), marginTop: '0.85rem' }}>
          <strong>✓ Connection created</strong>: {created.displayName ?? created.baseUrl}
          <div style={{ marginTop: '0.5rem' }}>
            <ValidateConnectionButton connectionId={created.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Validate Connection Button ───────────────────────────────────────────────

export function ValidateConnectionButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ healthy: boolean; message: string } | null>(null);

  async function handleValidate() {
    setValidating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/admin/jira-connections/${connectionId}/validate`, {
        method: 'POST',
      });
      const data: unknown = await res.json();
      const d = data as { healthStatus?: string; warnings?: Array<{ message: string }> };
      const healthy = d.healthStatus === 'healthy';
      setResult({
        healthy,
        message: healthy
          ? 'Connection is healthy.'
          : (d.warnings?.[0]?.message ?? 'Validation failed.'),
      });
      router.refresh();
    } catch {
      setResult({ healthy: false, message: 'Network error during validation.' });
    } finally {
      setValidating(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
      <button type="button" onClick={() => { void handleValidate(); }} disabled={validating} style={buttonStyle('secondary', validating)}>
        {validating ? 'Validating…' : 'Validate Connection'}
      </button>
      {result && (
        <span style={tonePillStyle(result.healthy ? 'positive' : 'danger')}>
          {result.message}
        </span>
      )}
    </span>
  );
}
