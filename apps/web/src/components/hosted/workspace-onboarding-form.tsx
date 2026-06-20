'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  buttonStyle,
  fieldLabelStyle,
  helperTextStyle,
  inputStyle,
  noticeStyle,
} from '@/components/app/chrome';

export function WorkspaceOnboardingForm({ brandName, defaultName }: { brandName: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [timezone, setTimezone] = useState('America/New_York');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/hosted/onboarding/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          defaultTimezone: timezone.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(data?.message ?? 'Unable to create hosted workspace.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event); }}>
      <label>
        <span style={fieldLabelStyle}>Workspace Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'block', marginTop: '0.9rem' }}>
        <span style={fieldLabelStyle}>Default Timezone</span>
        <input
          type="text"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          required
          style={inputStyle}
        />
      </label>
      <p style={helperTextStyle}>Hosted beta creates one {brandName} workspace for the active Clerk organization.</p>
      {error && (
        <div style={{ ...noticeStyle('danger'), margin: '0.9rem 0' }}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}
      <button type="submit" disabled={submitting} style={buttonStyle('primary', submitting)}>
        {submitting ? 'Creating...' : 'Create Workspace'}
      </button>
    </form>
  );
}
