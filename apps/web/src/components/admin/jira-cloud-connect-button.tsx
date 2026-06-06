'use client';

import { useState } from 'react';

import { buttonStyle, noticeStyle, tonePillStyle } from '@/components/app/chrome';

export function JiraCloudConnectButton() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startOAuth() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/atlassian/oauth/start?returnUrl=/admin/jira', {
        method: 'POST',
      });
      const data = (await response.json().catch(() => null)) as {
        authorizationUrl?: string;
        message?: string;
      } | null;
      if (!response.ok || !data?.authorizationUrl) {
        setError(data?.message ?? 'Unable to start Jira Cloud OAuth.');
        return;
      }
      window.location.assign(data.authorizationUrl);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <button
        type="button"
        onClick={() => { void startOAuth(); }}
        disabled={submitting}
        style={buttonStyle('primary', submitting)}
      >
        {submitting ? 'Opening Atlassian...' : 'Connect Jira Cloud'}
      </button>
      <span style={tonePillStyle('info')}>OAuth 2.0</span>
      {error && (
        <div style={noticeStyle('danger')}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}
