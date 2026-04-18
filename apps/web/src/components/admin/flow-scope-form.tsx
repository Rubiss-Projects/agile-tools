'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  JiraConnection,
  FlowScope,
  BoardSummary,
  BoardDiscoveryDetail,
} from '@agile-tools/shared/contracts/api';

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
      <button type="button" onClick={() => setExpanded(true)} style={{ marginTop: '0.75rem' }}>
        + Add Flow Scope
      </button>
    );
  }

  if (created) {
    return (
      <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9f0', border: '1px solid #b2dfdb' }}>
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
    <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd' }}>
      <h3 style={{ marginTop: 0 }}>Create Flow Scope</h3>

      {/* Step 1: Select connection and discover boards */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label>
          Connection
          <br />
          <select
            value={connectionId}
            onChange={(e) => handleConnectionChange(e.target.value)}
            style={{ marginRight: '0.5rem' }}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName ?? c.baseUrl}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => { void loadBoards(); }} disabled={loadingBoards || !connectionId}>
          {loadingBoards ? 'Loading…' : 'Discover Boards'}
        </button>
        {boardsError && <p style={{ color: 'red', margin: '0.25rem 0' }}>{boardsError}</p>}
      </div>

      {/* Step 2: Select board and inspect */}
      {boards.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Board
            <br />
            <select
              value={selectedBoardId ?? ''}
              onChange={(e) => {
                setSelectedBoardId(Number(e.target.value));
                setBoardDetail(null);
              }}
              style={{ marginRight: '0.5rem' }}
            >
              {boards.map((b) => (
                <option key={b.boardId} value={b.boardId}>
                  {b.boardName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => { void inspectBoard(); }} disabled={inspecting || !selectedBoardId}>
            {inspecting ? 'Inspecting…' : 'Inspect Board'}
          </button>
          {inspectError && <p style={{ color: 'red', margin: '0.25rem 0' }}>{inspectError}</p>}
        </div>
      )}

      {/* Step 3: Configure and submit */}
      {boardDetail && (
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <fieldset style={{ marginBottom: '0.75rem', border: '1px solid #ccc', padding: '0.75rem' }}>
            <legend>
              <strong>Start Statuses</strong> — when work begins
            </legend>
            {boardDetail.statuses.map((s) => (
              <label key={s.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={startStatusIds.includes(s.id)}
                  onChange={() => setStartStatusIds((prev) => toggleId(prev, s.id))}
                />{' '}
                {s.name}
              </label>
            ))}
          </fieldset>

          <fieldset style={{ marginBottom: '0.75rem', border: '1px solid #ccc', padding: '0.75rem' }}>
            <legend>
              <strong>Done Statuses</strong> — when work completes
            </legend>
            {boardDetail.statuses.map((s) => (
              <label key={s.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={doneStatusIds.includes(s.id)}
                  onChange={() => setDoneStatusIds((prev) => toggleId(prev, s.id))}
                />{' '}
                {s.name}
              </label>
            ))}
          </fieldset>

          <fieldset style={{ marginBottom: '0.75rem', border: '1px solid #ccc', padding: '0.75rem' }}>
            <legend>
              <strong>Issue Types</strong> — types to include in flow tracking
            </legend>
            {boardDetail.issueTypes.map((t) => (
              <label key={t.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={includedIssueTypeIds.includes(t.id)}
                  onChange={() => setIncludedIssueTypeIds((prev) => toggleId(prev, t.id))}
                />{' '}
                {t.name}
              </label>
            ))}
          </fieldset>

          <div style={{ marginBottom: '0.75rem' }}>
            <label>
              Timezone (IANA name)
              <br />
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
                placeholder="UTC"
                style={{ width: '200px' }}
              />
            </label>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label>
              Sync interval (minutes, 5–15)
              <br />
              <input
                type="number"
                value={syncIntervalMinutes}
                min={5}
                max={15}
                onChange={(e) => setSyncIntervalMinutes(Number(e.target.value))}
                required
                style={{ width: '80px' }}
              />
            </label>
          </div>

          {submitError && <p style={{ color: 'red' }}>{submitError}</p>}
          <button type="submit" disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create Flow Scope'}
          </button>
          {!submitting && !canSubmit && (
            <span style={{ marginLeft: '0.5rem', color: '#888', fontSize: '0.875rem' }}>
              Select at least one start status, done status, and issue type.
            </span>
          )}
        </form>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button type="button" onClick={() => setExpanded(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
