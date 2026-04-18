'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { JiraConnection } from '@agile-tools/shared/contracts/api';

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
    <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd' }}>
      <h3 style={{ marginTop: 0 }}>Add Jira Connection</h3>
      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Jira Base URL
            <br />
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://jira.example.com"
              required
              style={{ width: '100%', maxWidth: '400px' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Personal Access Token (PAT)
            <br />
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              required
              style={{ width: '100%', maxWidth: '400px' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Display Name (optional)
            <br />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. My Team Jira"
              style={{ width: '100%', maxWidth: '400px' }}
            />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Connection'}
        </button>
      </form>
      {created && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f0f9f0', border: '1px solid #b2dfdb' }}>
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
    <span>
      <button type="button" onClick={() => { void handleValidate(); }} disabled={validating}>
        {validating ? 'Validating…' : 'Validate Connection'}
      </button>
      {result && (
        <span style={{ marginLeft: '0.5rem', color: result.healthy ? 'green' : 'red' }}>
          {result.message}
        </span>
      )}
    </span>
  );
}
