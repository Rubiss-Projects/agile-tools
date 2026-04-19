'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  JiraConnection,
  FlowScope,
  BoardSummary,
  BoardDiscoveryDetail,
} from '@agile-tools/shared/contracts/api';
import {
  buttonStyle,
  checkboxChipStyle,
  fieldLabelStyle,
  helperTextStyle,
  inputStyle,
  insetPanelStyle,
  noticeStyle,
  sectionCopyStyle,
  sectionTitleStyle,
  selectStyle,
} from '@/components/app/chrome';

interface Props {
  connections: JiraConnection[];
}

export function FlowScopeForm({ connections }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  // Board discovery state
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  // Board inspection state
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [boardDetail, setBoardDetail] = useState<BoardDiscoveryDetail | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Scope configuration state
  const [timezone, setTimezone] = useState('UTC');
  const [includedIssueTypeIds, setIncludedIssueTypeIds] = useState<string[]>([]);
  const [startStatusIds, setStartStatusIds] = useState<string[]>([]);
  const [doneStatusIds, setDoneStatusIds] = useState<string[]>([]);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(5);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<FlowScope | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleConnectionChange(id: string) {
    setConnectionId(id);
    setBoards([]);
    setBoardDetail(null);
    setSelectedBoardId(null);
    setBoardsError(null);
    setInspectError(null);
  }

  async function loadBoards() {
    setBoardsError(null);
    setLoadingBoards(true);
    setBoards([]);
    setBoardDetail(null);
    setSelectedBoardId(null);
    try {
      const res = await fetch(
        `/api/v1/admin/jira-connections/${connectionId}/discovery/boards`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'Discovery failed.');
      }
      const { boards: discovered } = data as { boards: BoardSummary[] };
      setBoards(discovered);
      if (discovered.length > 0) setSelectedBoardId(discovered[0]!.boardId);
    } catch (err) {
      setBoardsError(err instanceof Error ? err.message : 'Failed to discover boards.');
    } finally {
      setLoadingBoards(false);
    }
  }

  async function inspectBoard() {
    if (!selectedBoardId) return;
    setInspectError(null);
    setInspecting(true);
    setBoardDetail(null);
    setIncludedIssueTypeIds([]);
    setStartStatusIds([]);
    setDoneStatusIds([]);
    try {
      const res = await fetch(
        `/api/v1/admin/jira-connections/${connectionId}/discovery/boards/${selectedBoardId}`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'Inspection failed.');
      }
      setBoardDetail(data as BoardDiscoveryDetail);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Failed to inspect board.');
    } finally {
      setInspecting(false);
    }
  }

  function toggleId(current: string[], id: string): string[] {
    return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedBoardId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/v1/admin/scopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          boardId: selectedBoardId,
          timezone: timezone.trim() || 'UTC',
          includedIssueTypeIds,
          startStatusIds,
          doneStatusIds,
          syncIntervalMinutes,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setSubmitError((data as { message?: string }).message ?? 'Failed to create scope.');
      } else {
        setCreated(data as FlowScope);
        router.refresh();
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} style={{ ...buttonStyle('secondary'), marginTop: '0.75rem' }}>
        + Add Flow Scope
      </button>
    );
  }

  if (created) {
    return (
      <div style={{ ...noticeStyle('success'), marginTop: '1rem' }}>
        <strong>✓ Flow scope created</strong> for board &ldquo;
        {created.boardName ?? `Board ${created.boardId}`}&rdquo;
        <div style={{ marginTop: '0.5rem' }}>
          <a href={`/scopes/${created.id}`}>View Scope →</a>
        </div>
      </div>
    );
  }

  const canSubmit =
    !submitting &&
    startStatusIds.length > 0 &&
    doneStatusIds.length > 0 &&
    includedIssueTypeIds.length > 0;

  return (
    <div style={{ ...insetPanelStyle, marginTop: '1rem' }}>
      <h3 style={{ ...sectionTitleStyle, marginBottom: '0.35rem' }}>Create Flow Scope</h3>
      <p style={{ ...sectionCopyStyle, marginBottom: '1rem' }}>
        Discover a board, inspect the workflow, and define what counts as start, done, and included work.
      </p>

      {/* Step 1: Select connection and discover boards */}
      <div style={{ ...insetPanelStyle, marginBottom: '0.9rem' }}>
        <label>
          <span style={fieldLabelStyle}>Connection</span>
          <select
            value={connectionId}
            onChange={(e) => handleConnectionChange(e.target.value)}
            style={{ ...selectStyle, marginBottom: '0.75rem' }}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName ?? c.baseUrl}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => { void loadBoards(); }} disabled={loadingBoards || !connectionId} style={buttonStyle('secondary', loadingBoards || !connectionId)}>
          {loadingBoards ? 'Loading…' : 'Discover Boards'}
        </button>
        <p style={helperTextStyle}>Board discovery uses the selected Jira connection and current PAT permissions.</p>
        {boardsError && <div style={{ ...noticeStyle('danger'), marginTop: '0.75rem' }}><p style={{ margin: 0 }}>{boardsError}</p></div>}
      </div>

      {/* Step 2: Select board and inspect */}
      {boards.length > 0 && (
        <div style={{ ...insetPanelStyle, marginBottom: '0.9rem' }}>
          <label>
            <span style={fieldLabelStyle}>Board</span>
            <select
              value={selectedBoardId ?? ''}
              onChange={(e) => {
                setSelectedBoardId(Number(e.target.value));
                setBoardDetail(null);
              }}
              style={{ ...selectStyle, marginBottom: '0.75rem' }}
            >
              {boards.map((b) => (
                <option key={b.boardId} value={b.boardId}>
                  {b.boardName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => { void inspectBoard(); }} disabled={inspecting || !selectedBoardId} style={buttonStyle('secondary', inspecting || !selectedBoardId)}>
            {inspecting ? 'Inspecting…' : 'Inspect Board'}
          </button>
          <p style={helperTextStyle}>Inspection reads board statuses and available issue types so you can map flow boundaries.</p>
          {inspectError && <div style={{ ...noticeStyle('danger'), marginTop: '0.75rem' }}><p style={{ margin: 0 }}>{inspectError}</p></div>}
        </div>
      )}

      {/* Step 3: Configure and submit */}
      {boardDetail && (
        <form onSubmit={(e) => { void handleSubmit(e); }}>
            <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
            <legend>
              <strong>Start Statuses</strong> — when work begins
            </legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
              {boardDetail.statuses.map((s) => (
                <label key={s.id} style={checkboxChipStyle(startStatusIds.includes(s.id))}>
                <input
                  type="checkbox"
                  checked={startStatusIds.includes(s.id)}
                  onChange={() => setStartStatusIds((prev) => toggleId(prev, s.id))}
                    style={{ accentColor: '#1d4ed8' }}
                />{' '}
                {s.name}
              </label>
            ))}
              </div>
          </fieldset>

            <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
            <legend>
              <strong>Done Statuses</strong> — when work completes
            </legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
              {boardDetail.statuses.map((s) => (
                <label key={s.id} style={checkboxChipStyle(doneStatusIds.includes(s.id))}>
                <input
                  type="checkbox"
                  checked={doneStatusIds.includes(s.id)}
                  onChange={() => setDoneStatusIds((prev) => toggleId(prev, s.id))}
                    style={{ accentColor: '#1d4ed8' }}
                />{' '}
                {s.name}
              </label>
            ))}
              </div>
          </fieldset>

            <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
            <legend>
              <strong>Issue Types</strong> — types to include in flow tracking
            </legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
              {boardDetail.issueTypes.map((t) => (
                <label key={t.id} style={checkboxChipStyle(includedIssueTypeIds.includes(t.id))}>
                <input
                  type="checkbox"
                  checked={includedIssueTypeIds.includes(t.id)}
                  onChange={() => setIncludedIssueTypeIds((prev) => toggleId(prev, t.id))}
                    style={{ accentColor: '#1d4ed8' }}
                />{' '}
                {t.name}
              </label>
            ))}
              </div>
          </fieldset>

          <div style={{ marginBottom: '0.75rem' }}>
            <label>
                <span style={fieldLabelStyle}>Timezone</span>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                placeholder="UTC"
                  style={{ ...inputStyle, maxWidth: '16rem' }}
              />
            </label>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label>
                <span style={fieldLabelStyle}>Sync Interval</span>
              <input
                type="number"
                value={syncIntervalMinutes}
                min={5}
                max={15}
                onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
                required
                  style={{ ...inputStyle, maxWidth: '8rem' }}
              />
            </label>
              <p style={helperTextStyle}>Use a 5 to 15 minute cadence to stay within the default guard rails.</p>
          </div>

            {submitError && <div style={{ ...noticeStyle('danger'), marginBottom: '0.75rem' }}><p style={{ margin: 0 }}>{submitError}</p></div>}
            <button type="submit" disabled={!canSubmit} style={buttonStyle('primary', !canSubmit)}>
            {submitting ? 'Creating…' : 'Create Flow Scope'}
          </button>
          {!submitting && !canSubmit && (
              <span style={{ marginLeft: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
              Select at least one start status, done status, and issue type.
            </span>
          )}
        </form>
      )}

      <div style={{ marginTop: '1rem' }}>
          <button type="button" onClick={() => setExpanded(false)} style={buttonStyle('secondary')}>
          Cancel
        </button>
      </div>
    </div>
  );
}
