'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonStyle, tonePillStyle } from '@/components/app/chrome';

export function TriggerSyncButton({ scopeId }: { scopeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTrigger() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/admin/scopes/${scopeId}/syncs`, {
        method: 'POST',
      });
      const data: unknown = await res.json();
      const d = data as { id?: string; message?: string; syncRunId?: string };
      if (res.status === 409) {
        setResult({ ok: false, message: 'A sync is already queued or running.' });
      } else if (!res.ok) {
        setResult({ ok: false, message: d.message ?? 'Failed to trigger sync.' });
      } else {
        setResult({ ok: true, message: `Sync queued (run ID: ${d.id ?? 'unknown'})` });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => { void handleTrigger(); }} disabled={loading} style={buttonStyle('primary', loading)}>
        {loading ? 'Triggering…' : 'Trigger Manual Sync'}
      </button>
      {result && (
        <span style={tonePillStyle(result.ok ? 'positive' : result.message.includes('already') ? 'warning' : 'danger')}>
          {result.message}
        </span>
      )}
    </div>
  );
}
