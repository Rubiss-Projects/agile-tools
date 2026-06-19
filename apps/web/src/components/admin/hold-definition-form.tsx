'use client';

import { useState, useEffect, type CSSProperties, type FormEvent } from 'react';
import type { HoldDefinitionResponse, HoldStatusOption, NamedValue } from '@agile-tools/shared/contracts/api';
import { buttonStyle, checkboxChipStyle, insetPanelStyle, noticeStyle, palette, sectionCopyStyle, selectionControlStyle } from '@/components/app/chrome';

interface HoldDefinitionFormProps {
  scopeId: string;
  availableStatuses?: Array<HoldStatusOption | NamedValue>;
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

  const statusOptions = mergeStatusOptions(availableStatuses ?? [], selected);

  return (
    <div style={{ marginTop: '1rem', borderTop: `1px solid ${palette.line}`, paddingTop: '1rem' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={buttonStyle('secondary')}
      >
        {expanded ? '▲' : '▼'} Hold Definition
        {current && (
            <span style={{ marginLeft: '0.5rem', color: palette.muted }}>
              ({current.holdStatusIds.length} hold statuses)
            </span>
        )}
      </button>

      {expanded && (
        <div style={{ ...insetPanelStyle, marginTop: '0.85rem', fontSize: '0.875rem' }}>
          {loading && <p style={sectionCopyStyle}>Loading…</p>}
          {!loading && (
            <form onSubmit={(e) => { void handleSubmit(e); }}>
              {statusOptions.length > 0 ? (
                <div>
                  <p style={{ margin: '0 0 0.6rem', color: palette.ink, fontWeight: 700 }}>
                    Hold Statuses
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {statusOptions.map((s) => (
                      <label
                        key={s.id}
                        style={checkboxChipStyle(selected.includes(s.id))}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={() => toggleStatus(s.id)}
                          disabled={saving}
                          style={selectionControlStyle}
                        />
                        <span>{s.name}</span>
                        {isHoldStatusOption(s) && (
                          <span style={holdStatusMetaStyle(s)}>
                            {formatPlacement(s)}
                          </span>
                        )}
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
              {statusOptions.length > 0 && (
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

function isHoldStatusOption(value: HoldStatusOption | NamedValue): value is HoldStatusOption {
  return 'placement' in value && 'onBoard' in value;
}

function mergeStatusOptions(
  availableStatuses: Array<HoldStatusOption | NamedValue>,
  selectedStatusIds: string[],
): Array<HoldStatusOption | NamedValue> {
  const byId = new Map(availableStatuses.map((status) => [status.id, status]));
  for (const id of selectedStatusIds) {
    if (!byId.has(id)) {
      byId.set(id, { id, name: id });
    }
  }
  return Array.from(byId.values());
}

function formatPlacement(status: HoldStatusOption): string {
  if (status.placement === 'off_board') return 'off-board';
  if (status.placement === 'before_start') return 'before start';
  if (status.placement === 'done') return 'done';
  return 'in flow';
}

function holdStatusMetaStyle(status: HoldStatusOption): CSSProperties {
  return {
    marginLeft: '0.15rem',
    padding: '0.08rem 0.35rem',
    borderRadius: '999px',
    border: `1px solid ${status.placement === 'off_board' ? palette.warning : palette.lineStrong}`,
    color: status.placement === 'off_board' ? palette.warning : palette.muted,
    fontSize: '0.68rem',
    lineHeight: 1.25,
    whiteSpace: 'nowrap',
  };
}
