'use client';

import { useState, useEffect, type FormEvent } from 'react';
import type { HoldDefinitionResponse } from '@agile-tools/shared/contracts/api';
import { buttonStyle, checkboxChipStyle, insetPanelStyle, noticeStyle, sectionCopyStyle } from '@/components/app/chrome';

interface HoldDefinitionFormProps {
  scopeId: string;
  availableStatuses?: Array<{ id: string; name: string }>;
}

export function HoldDefinitionForm({ scopeId, availableStatuses }: HoldDefinitionFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState<HoldDefinitionResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/scopes/${scopeId}/hold-definition`)
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HoldDefinitionResponse>;
      })
      .then((data) => {
        setCurrent(data);
        setSelected(data?.holdStatusIds ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load hold definition.');
        setLoading(false);
      });
  }, [scopeId, expanded]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Select at least one hold status.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/admin/scopes/${scopeId}/hold-definition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdStatusIds: selected }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError((data as { message?: string }).message ?? 'Failed to save.');
      } else {
        setCurrent(data as HoldDefinitionResponse);
        setSaved(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function toggleStatus(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={buttonStyle('secondary')}
      >
        {expanded ? '▲' : '▼'} Hold Definition
        {current && (
          <span style={{ marginLeft: '0.5rem', color: '#475569' }}>
            ({current.holdStatusIds.length} hold statuses)
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ ...insetPanelStyle, marginTop: '0.85rem', fontSize: '0.875rem' }}>
          {loading && <p style={sectionCopyStyle}>Loading…</p>}
          {!loading && (
            <form onSubmit={(e) => { void handleSubmit(e); }}>
              {availableStatuses && availableStatuses.length > 0 ? (
                <div>
                  <p style={{ margin: '0 0 0.6rem', color: '#0f172a', fontWeight: 700 }}>
                    Hold Statuses
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {availableStatuses.map((s) => (
                      <label
                        key={s.id}
                        style={checkboxChipStyle(selected.includes(s.id))}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={() => toggleStatus(s.id)}
                          disabled={saving}
                          style={{ accentColor: '#1d4ed8' }}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={sectionCopyStyle}>
                  No workflow statuses available yet. Sync the board first.
                </p>
              )}
              {error && <div style={{ ...noticeStyle('danger'), marginBottom: '0.75rem' }}><p style={{ margin: 0 }}>{error}</p></div>}
              {saved && (
                <div style={{ ...noticeStyle('success'), marginBottom: '0.75rem' }}><p style={{ margin: 0 }}>Hold definition saved.</p></div>
              )}
              {availableStatuses && availableStatuses.length > 0 && (
                <button
                  type="submit"
                  disabled={saving}
                  style={buttonStyle('secondary', saving)}
                >
                  {saving ? 'Saving…' : 'Save Hold Definition'}
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
