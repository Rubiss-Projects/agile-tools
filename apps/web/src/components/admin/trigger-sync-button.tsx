'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SyncRun } from '@agile-tools/shared/contracts/api';
import { buttonStyle, tonePillStyle } from '@/components/app/chrome';

const SYNC_POLL_INTERVAL_MS = 2_000;
const TERMINAL_SYNC_STATUSES = new Set<SyncRun['status']>(['succeeded', 'failed', 'canceled']);

type SyncResult = {
  tone: 'positive' | 'warning' | 'danger' | 'info';
  message: string;
};

function isSyncRun(value: unknown): value is SyncRun {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { status?: unknown }).status === 'string'
  );
}

function terminalSyncMessage(syncRun: SyncRun): SyncResult {
  if (syncRun.status === 'succeeded') {
    return { tone: 'positive', message: 'Sync succeeded. Page data updated.' };
  }
  if (syncRun.status === 'canceled') {
    return { tone: 'warning', message: 'Sync canceled. Page data updated.' };
  }
  return {
    tone: 'danger',
    message: syncRun.errorSummary
      ? `Sync failed: ${syncRun.errorSummary}`
      : 'Sync failed. Page data updated.',
  };
}

function useRefreshWhenSyncFinishes(
  syncRunId: string | null,
  onComplete?: (syncRun: SyncRun) => void,
) {
  const router = useRouter();

  useEffect(() => {
    if (!syncRunId) return;

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function pollSyncRun() {
      controller?.abort();
      controller = new AbortController();

      try {
        const res = await fetch(`/api/v1/syncs/${syncRunId}`, {
          signal: controller.signal,
        });
        const data: unknown = await res.json().catch(() => null);
        if (stopped) return;

        if (res.ok && isSyncRun(data) && TERMINAL_SYNC_STATUSES.has(data.status)) {
          onComplete?.(data);
          router.refresh();
          return;
        }
      } catch (err) {
        if (stopped || (err instanceof Error && err.name === 'AbortError')) return;
      }

      if (!stopped) {
        timeoutId = setTimeout(() => {
          void pollSyncRun();
        }, SYNC_POLL_INTERVAL_MS);
      }
    }

    void pollSyncRun();

    return () => {
      stopped = true;
      controller?.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [onComplete, router, syncRunId]);
}

export function SyncCompletionRefresh({ syncRunId }: { syncRunId: string | null }) {
  useRefreshWhenSyncFinishes(syncRunId);
  return null;
}

export function TriggerSyncButton({
  scopeId,
  activeSyncRunId = null,
}: {
  scopeId: string;
  activeSyncRunId?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [watchedSyncRunId, setWatchedSyncRunId] = useState<string | null>(activeSyncRunId);
  const busy = loading || watchedSyncRunId !== null;

  useEffect(() => {
    setWatchedSyncRunId(activeSyncRunId);
    if (activeSyncRunId) {
      setResult({ tone: 'info', message: 'Sync in progress. Page data will update when it finishes.' });
    }
  }, [activeSyncRunId]);

  const handleSyncComplete = useCallback((syncRun: SyncRun) => {
    setWatchedSyncRunId(null);
    setResult(terminalSyncMessage(syncRun));
  }, []);

  useRefreshWhenSyncFinishes(watchedSyncRunId, handleSyncComplete);

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
        if (d.syncRunId) {
          setWatchedSyncRunId(d.syncRunId);
          setResult({ tone: 'warning', message: 'A sync is already queued or running. Page data will update when it finishes.' });
          router.refresh();
        } else {
          setResult({ tone: 'warning', message: 'A sync is already queued or running.' });
        }
      } else if (!res.ok) {
        setResult({ tone: 'danger', message: d.message ?? 'Failed to trigger sync.' });
      } else {
        if (d.id) {
          setWatchedSyncRunId(d.id);
        }
        setResult({ tone: 'info', message: `Sync queued (run ID: ${d.id ?? 'unknown'}). Page data will update when it finishes.` });
        router.refresh();
      }
    } catch {
      setResult({ tone: 'danger', message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => { void handleTrigger(); }} disabled={busy} style={buttonStyle('primary', busy)}>
        {loading ? 'Triggering…' : watchedSyncRunId ? 'Sync in progress…' : 'Trigger Manual Sync'}
      </button>
      {result && (
        <span style={tonePillStyle(result.tone)}>
          {result.message}
        </span>
      )}
    </div>
  );
}
