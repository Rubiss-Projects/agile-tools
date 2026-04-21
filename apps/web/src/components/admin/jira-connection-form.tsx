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

interface JiraConnectionFormProps {
  initialConnection?: JiraConnection;
}

interface SubmitResult {
  connection: JiraConnection;
  requiresValidation: boolean;
}

export function JiraConnectionForm({ initialConnection }: JiraConnectionFormProps) {
  const router = useRouter();
  const isEditMode = initialConnection !== undefined;
  const [expanded, setExpanded] = useState(!isEditMode);
  const [baseUrl, setBaseUrl] = useState(initialConnection?.baseUrl ?? '');
  const [pat, setPat] = useState('');
  const [displayName, setDisplayName] = useState(initialConnection?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetEditState() {
    setBaseUrl(initialConnection?.baseUrl ?? '');
    setPat('');
    setDisplayName(initialConnection?.displayName ?? '');
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedPat = pat.trim();
    const trimmedDisplayName = displayName.trim();
    const shouldRotatePat = trimmedPat.length > 0;
    const requiresValidation =
      isEditMode &&
      (trimmedBaseUrl.replace(/\/$/, '') !== initialConnection.baseUrl || shouldRotatePat);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        isEditMode
          ? `/api/v1/admin/jira-connections/${initialConnection.id}`
          : '/api/v1/admin/jira-connections',
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseUrl: trimmedBaseUrl,
            ...(!isEditMode || shouldRotatePat ? { pat: trimmedPat } : {}),
            ...(!isEditMode
              ? (trimmedDisplayName && { displayName: trimmedDisplayName })
              : { displayName: trimmedDisplayName }),
          }),
        },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        setError((data as { message?: string }).message ?? `Failed to ${isEditMode ? 'update' : 'create'} connection.`);
      } else {
        const connection = data as JiraConnection;
        setResult({ connection, requiresValidation });
        if (!isEditMode) {
          setBaseUrl('');
          setDisplayName('');
        }
        setPat('');
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isEditMode && !expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} style={{ ...buttonStyle('secondary'), marginTop: '0.75rem' }}>
        Edit Connection
      </button>
    );
  }

  return (
    <div style={{ ...insetPanelStyle, marginTop: '1rem' }}>
      <h3 style={{ ...sectionTitleStyle, marginBottom: '0.35rem' }}>
        {isEditMode ? 'Edit Jira Connection' : 'Add Jira Connection'}
      </h3>
      <p style={{ ...sectionCopyStyle, marginBottom: '1rem' }}>
        {isEditMode
          ? 'Update the Jira base URL, display name, or rotate the PAT for this connection.'
          : 'Store the Jira base URL and PAT used for board discovery and scheduled syncs.'}
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
            <span style={fieldLabelStyle}>
              {isEditMode ? 'Replace Personal Access Token' : 'Personal Access Token'}
            </span>
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              required={!isEditMode}
              style={inputStyle}
            />
          </label>
          {isEditMode && (
            <p style={helperTextStyle}>Leave blank to keep the current PAT. Changing the PAT requires re-validation.</p>
          )}
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
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" disabled={submitting} style={buttonStyle('primary', submitting)}>
            {submitting ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Save Changes' : 'Create Connection')}
          </button>
          {isEditMode && (
            <button
              type="button"
              onClick={() => {
                resetEditState();
                setExpanded(false);
              }}
              style={buttonStyle('secondary')}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      {result && (
        <div style={{ ...noticeStyle('success'), marginTop: '0.85rem' }}>
          <strong>{isEditMode ? '✓ Connection updated' : '✓ Connection created'}</strong>
          {': '}
          {result.connection.displayName ?? result.connection.baseUrl}
          {isEditMode && result.requiresValidation && (
            <p style={{ margin: '0.5rem 0 0', color: '#166534', fontSize: '0.9rem' }}>
              Validate the connection again before relying on sync results.
            </p>
          )}
          <div style={{ marginTop: '0.5rem' }}>
            <ValidateConnectionButton connectionId={result.connection.id} />
          </div>
        </div>
      )}
    </div>
  );
}

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
