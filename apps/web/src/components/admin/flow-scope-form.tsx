'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
  palette,
  sectionCopyStyle,
  sectionTitleStyle,
  selectionControlStyle,
  selectStyle,
  linkStyle,
} from '@/components/app/chrome';

interface Props {
  connections: JiraConnection[];
  initialScope?: FlowScope;
}

interface SubmitResult {
  scope: FlowScope;
  syncQueued: boolean;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== new Set(right).size) return false;
  return right.every((value) => leftSet.has(value));
}

function filterSelectedIds(candidates: string[], allowedIds: Set<string>): string[] {
  return candidates.filter((candidate) => allowedIds.has(candidate));
}

export function FlowScopeForm({ connections, initialScope }: Props) {
  const router = useRouter();
  const isEditMode = initialScope !== undefined;
  const initializedEditRef = useRef(false);
  const [expanded, setExpanded] = useState(!isEditMode);

  const [connectionId, setConnectionId] = useState(initialScope?.connectionId ?? connections[0]?.id ?? '');
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);

  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(initialScope?.boardId ?? null);
  const [boardDetail, setBoardDetail] = useState<BoardDiscoveryDetail | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [loadingExistingConfig, setLoadingExistingConfig] = useState(false);

  const [timezone, setTimezone] = useState(initialScope?.timezone ?? 'UTC');
  const [includedIssueTypeIds, setIncludedIssueTypeIds] = useState<string[]>(initialScope?.includedIssueTypeIds ?? []);
  const [startStatusIds, setStartStatusIds] = useState<string[]>(initialScope?.startStatusIds ?? []);
  const [doneStatusIds, setDoneStatusIds] = useState<string[]>(initialScope?.doneStatusIds ?? []);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(initialScope?.syncIntervalMinutes ?? 5);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const usingSavedEditConfig =
    isEditMode &&
    initialScope !== undefined &&
    connectionId === initialScope.connectionId &&
    selectedBoardId === initialScope.boardId &&
    boardDetail === null;
  const inspectedBoardMatchesSelection =
    boardDetail !== null && selectedBoardId !== null && boardDetail.boardId === selectedBoardId;

  const clearSelections = useCallback(() => {
    setIncludedIssueTypeIds([]);
    setStartStatusIds([]);
    setDoneStatusIds([]);
  }, []);

  const resetBoardInspection = useCallback(() => {
    setBoardDetail(null);
    setInspectError(null);
    clearSelections();
  }, [clearSelections]);

  function restoreInitialScopeState() {
    if (!initialScope) return;
    setConnectionId(initialScope.connectionId);
    setBoards([]);
    setBoardsError(null);
    setSelectedBoardId(initialScope.boardId);
    setBoardDetail(null);
    setInspectError(null);
    setTimezone(initialScope.timezone);
    setIncludedIssueTypeIds(initialScope.includedIssueTypeIds);
    setStartStatusIds(initialScope.startStatusIds);
    setDoneStatusIds(initialScope.doneStatusIds);
    setSyncIntervalMinutes(initialScope.syncIntervalMinutes);
    setSubmitError(null);
    setResult(null);
    initializedEditRef.current = false;
  }

  const applyScopeSelections = useCallback((detail: BoardDiscoveryDetail, scope: FlowScope) => {
    const visibleStatusIds = new Set(detail.statuses.map((status) => status.id));
    const completionStatusIds = new Set(
      (detail.completionStatuses ?? detail.statuses).map((status) => status.id),
    );
    const issueTypeIds = new Set(detail.issueTypes.map((issueType) => issueType.id));

    setStartStatusIds(filterSelectedIds(scope.startStatusIds, visibleStatusIds));
    setDoneStatusIds(filterSelectedIds(scope.doneStatusIds, completionStatusIds));
    setIncludedIssueTypeIds(filterSelectedIds(scope.includedIssueTypeIds, issueTypeIds));
  }, []);

  const loadBoards = useCallback(async (
    activeConnectionId = connectionId,
    preferredBoardId?: number,
  ): Promise<number | null> => {
    setBoardsError(null);
    setLoadingBoards(true);
    setBoards([]);
    setBoardDetail(null);
    setInspectError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/jira-connections/${activeConnectionId}/discovery/boards`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'Discovery failed.');
      }
      const { boards: discovered } = data as { boards: BoardSummary[] };
      setBoards(discovered);

      if (preferredBoardId !== undefined) {
        const preferredBoard = discovered.find((board) => board.boardId === preferredBoardId);
        if (preferredBoard) {
          setSelectedBoardId(preferredBoardId);
          return preferredBoardId;
        } else if (discovered.length > 0) {
          setSelectedBoardId(discovered[0]!.boardId);
          setBoardsError('The previously selected board is no longer visible. Select another board and inspect it.');
          return null;
        }
        return null;
      }

      if (discovered.length > 0) {
        setSelectedBoardId(discovered[0]!.boardId);
        return discovered[0]!.boardId;
      }
      return null;
    } catch (err) {
      setBoardsError(err instanceof Error ? err.message : 'Failed to discover boards.');
      return null;
    } finally {
      setLoadingBoards(false);
    }
  }, [connectionId]);

  const inspectBoard = useCallback(async (
    boardId = selectedBoardId,
    activeConnectionId = connectionId,
    scopeToApply?: FlowScope,
  ) => {
    if (!boardId) return;
    const preserveSavedConfig =
      initialScope !== undefined &&
      activeConnectionId === initialScope.connectionId &&
      boardId === initialScope.boardId;
    setInspectError(null);
    setInspecting(true);
    if (!preserveSavedConfig) {
      setBoardDetail(null);
      clearSelections();
    }
    try {
      const res = await fetch(
        `/api/v1/admin/jira-connections/${activeConnectionId}/discovery/boards/${boardId}`,
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'Inspection failed.');
      }
      const detail = data as BoardDiscoveryDetail;
      setBoardDetail(detail);
      if (scopeToApply) {
        applyScopeSelections(detail, scopeToApply);
      }
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Failed to inspect board.');
    } finally {
      setInspecting(false);
    }
  }, [applyScopeSelections, clearSelections, connectionId, initialScope, selectedBoardId]);

  useEffect(() => {
    if (!isEditMode || !expanded || initializedEditRef.current) return;
    initializedEditRef.current = true;
    void (async () => {
      if (!initialScope) return;
      setLoadingExistingConfig(true);
      try {
        const boardIdToInspect = await loadBoards(initialScope.connectionId, initialScope.boardId);
        if (boardIdToInspect !== null) {
          await inspectBoard(boardIdToInspect, initialScope.connectionId, initialScope);
        }
      } finally {
        setLoadingExistingConfig(false);
      }
    })();
  }, [expanded, initialScope, inspectBoard, isEditMode, loadBoards]);

  function handleConnectionChange(id: string) {
    setConnectionId(id);
    setBoards([]);
    setBoardsError(null);
    setSelectedBoardId(null);
    resetBoardInspection();
  }

  function toggleId(current: string[], id: string): string[] {
    return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedBoardId) return;

    const payload = {
      connectionId,
      boardId: selectedBoardId,
      timezone: timezone.trim() || 'UTC',
      includedIssueTypeIds,
      startStatusIds,
      doneStatusIds,
      syncIntervalMinutes,
    };
    const syncQueued = initialScope !== undefined && (
      initialScope.connectionId !== payload.connectionId ||
      initialScope.boardId !== payload.boardId ||
      initialScope.timezone !== payload.timezone ||
      !sameStringSet(initialScope.includedIssueTypeIds, payload.includedIssueTypeIds) ||
      !sameStringSet(initialScope.startStatusIds, payload.startStatusIds) ||
      !sameStringSet(initialScope.doneStatusIds, payload.doneStatusIds)
    );

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        isEditMode ? `/api/v1/admin/scopes/${initialScope.id}` : '/api/v1/admin/scopes',
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        setSubmitError((data as { message?: string }).message ?? `Failed to ${isEditMode ? 'update' : 'create'} scope.`);
      } else {
        setResult({ scope: data as FlowScope, syncQueued });
        router.refresh();
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isEditMode && !expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} style={{ ...buttonStyle('secondary'), marginTop: '0.75rem' }}>
        Edit Flow Scope
      </button>
    );
  }

  if (!isEditMode && !expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} style={{ ...buttonStyle('secondary'), marginTop: '0.75rem' }}>
        + Add Flow Scope
      </button>
    );
  }

  if (result) {
    return (
      <div style={{ ...noticeStyle('success'), marginTop: '1rem' }}>
        <strong>{isEditMode ? '✓ Flow scope updated' : '✓ Flow scope created'}</strong> for board &ldquo;
        {result.scope.boardName ?? `Board ${result.scope.boardId}`}&rdquo;
        {isEditMode && result.syncQueued && (
          <p style={{ margin: '0.5rem 0 0', color: '#166534', fontSize: '0.9rem' }}>
            A follow-up sync was queued because the board or flow boundaries changed.
          </p>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <a href={`/scopes/${result.scope.id}`} style={linkStyle}>View Scope →</a>
        </div>
      </div>
    );
  }

  const canSubmitWithSavedConfig =
    usingSavedEditConfig &&
    startStatusIds.length > 0 &&
    doneStatusIds.length > 0 &&
    includedIssueTypeIds.length > 0;
  const canSubmit =
    !submitting &&
    selectedBoardId !== null &&
    startStatusIds.length > 0 &&
    doneStatusIds.length > 0 &&
    includedIssueTypeIds.length > 0 &&
    (inspectedBoardMatchesSelection || canSubmitWithSavedConfig);

  const completionStatuses = boardDetail?.completionStatuses ?? boardDetail?.statuses ?? [];
  const boardStatusIds = new Set(boardDetail?.statuses.map((status) => status.id) ?? []);

  return (
    <div style={{ ...insetPanelStyle, marginTop: '1rem' }}>
      <h3 style={{ ...sectionTitleStyle, marginBottom: '0.35rem' }}>
        {isEditMode ? 'Edit Flow Scope' : 'Create Flow Scope'}
      </h3>
      <p style={{ ...sectionCopyStyle, marginBottom: '1rem' }}>
        {isEditMode
          ? 'Update the board, statuses, issue types, or cadence used to build analytics projections.'
          : 'Discover a board, inspect the workflow, and define what counts as start, done, and included work.'}
      </p>

      {loadingExistingConfig && (
        <div style={{ ...noticeStyle('info'), marginBottom: '0.9rem' }}>
          <p style={{ margin: 0 }}>Loading the current board configuration…</p>
        </div>
      )}

      <div style={{ ...insetPanelStyle, marginBottom: '0.9rem' }}>
        <label>
          <span style={fieldLabelStyle}>Connection</span>
          <select
            value={connectionId}
            onChange={(e) => handleConnectionChange(e.target.value)}
            style={{ ...selectStyle, marginBottom: '0.75rem' }}
          >
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.displayName ?? connection.baseUrl}
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

      {boards.length > 0 && (
        <div style={{ ...insetPanelStyle, marginBottom: '0.9rem' }}>
          <label>
            <span style={fieldLabelStyle}>Board</span>
            <select
              value={selectedBoardId ?? ''}
              onChange={(e) => {
                setSelectedBoardId(Number(e.target.value));
                resetBoardInspection();
              }}
              style={{ ...selectStyle, marginBottom: '0.75rem' }}
            >
              {boards.map((board) => (
                <option key={board.boardId} value={board.boardId}>
                  {board.boardName}
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

      {(inspectedBoardMatchesSelection || canSubmitWithSavedConfig) && (
        <form onSubmit={(e) => { void handleSubmit(e); }}>
<<<<<<< HEAD
          {inspectedBoardMatchesSelection && boardDetail ? (
            <>
              <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
                <legend>
                  <strong>Start Statuses</strong> — when work begins
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
                  {boardDetail.statuses.map((status) => (
                    <label key={status.id} style={checkboxChipStyle(startStatusIds.includes(status.id))}>
                      <input
                        type="checkbox"
                        checked={startStatusIds.includes(status.id)}
                        onChange={() => setStartStatusIds((prev) => toggleId(prev, status.id))}
                        style={{ accentColor: '#1d4ed8' }}
                      />{' '}
                      {status.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
                <legend>
                  <strong>Done Statuses</strong> — when work completes
                </legend>
                <p style={{ ...helperTextStyle, margin: '0.5rem 0 0' }}>
                  Completion statuses can include workflow states that are not currently shown as board columns.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
                  {completionStatuses.map((status) => (
                    <label key={status.id} style={checkboxChipStyle(doneStatusIds.includes(status.id))}>
                      <input
                        type="checkbox"
                        checked={doneStatusIds.includes(status.id)}
                        onChange={() => setDoneStatusIds((prev) => toggleId(prev, status.id))}
                        style={{ accentColor: '#1d4ed8' }}
                      />{' '}
                      {boardStatusIds.has(status.id) ? status.name : `${status.name} (off-board)`}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ ...insetPanelStyle, marginBottom: '0.9rem', paddingTop: '1rem' }}>
                <legend>
                  <strong>Issue Types</strong> — types to include in flow tracking
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
                  {boardDetail.issueTypes.map((issueType) => (
                    <label key={issueType.id} style={checkboxChipStyle(includedIssueTypeIds.includes(issueType.id))}>
                      <input
                        type="checkbox"
                        checked={includedIssueTypeIds.includes(issueType.id)}
                        onChange={() => setIncludedIssueTypeIds((prev) => toggleId(prev, issueType.id))}
                        style={{ accentColor: '#1d4ed8' }}
                      />{' '}
                      {issueType.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <div style={{ ...noticeStyle('info'), marginBottom: '0.9rem' }}>
              <p style={{ margin: 0 }}>
                Using the saved scope mapping because Jira inspection is unavailable. You can still change cadence or timezone,
                but switch the connection or board and re-run inspection before editing statuses or issue types.
              </p>
            </div>
          )}
=======
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
                    style={selectionControlStyle}
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
            <p style={{ ...helperTextStyle, margin: '0.5rem 0 0' }}>
              Completion statuses can include workflow states that are not currently shown as board columns.
            </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.5rem' }}>
              {completionStatuses.map((s) => (
                <label key={s.id} style={checkboxChipStyle(doneStatusIds.includes(s.id))}>
                <input
                  type="checkbox"
                  checked={doneStatusIds.includes(s.id)}
                  onChange={() => setDoneStatusIds((prev) => toggleId(prev, s.id))}
                    style={selectionControlStyle}
                />{' '}
                {boardStatusIds.has(s.id) ? s.name : `${s.name} (off-board)`}
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
                    style={selectionControlStyle}
                />{' '}
                {t.name}
              </label>
            ))}
              </div>
          </fieldset>
>>>>>>> b021ae1 (Refresh web UI theming)

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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={!canSubmit} style={buttonStyle('primary', !canSubmit)}>
<<<<<<< HEAD
              {submitting ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Save Flow Scope' : 'Create Flow Scope')}
            </button>
            {!submitting && !canSubmit && (
              <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                {usingSavedEditConfig
                  ? 'Retry board inspection or keep the saved board selection to submit the existing mapping.'
                  : 'Select at least one start status, done status, and issue type.'}
              </span>
            )}
          </div>
=======
            {submitting ? 'Creating…' : 'Create Flow Scope'}
          </button>
          {!submitting && !canSubmit && (
              <span style={{ marginLeft: '0.75rem', color: palette.soft, fontSize: '0.875rem' }}>
                Select at least one start status, done status, and issue type.
              </span>
          )}
>>>>>>> b021ae1 (Refresh web UI theming)
        </form>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button
          type="button"
          onClick={() => {
            if (isEditMode) {
              restoreInitialScopeState();
            }
            setExpanded(false);
          }}
          style={buttonStyle('secondary')}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
