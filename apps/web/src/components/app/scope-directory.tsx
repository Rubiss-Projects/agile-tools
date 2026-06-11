'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  buttonStyle,
  checkboxChipStyle,
  fieldLabelStyle,
  helperTextStyle,
  inputStyle,
  itemCardStyle,
  linkStyle,
  palette,
  sectionCopyStyle,
  sectionHeaderRowStyle,
  sectionStackStyle,
  sectionTitleStyle,
  selectStyle,
  tonePillStyle,
} from '@/components/app/chrome';

export interface HomeScopeSummary {
  id: string;
  boardId: string;
  boardName: string;
  timezone: string;
  includedIssueTypeNames: string[];
  syncIntervalMinutes: number;
  status: string;
  jiraDashboardUrl: string | null;
}

interface ScopeDirectoryProps {
  workspaceId: string;
  scopes: HomeScopeSummary[];
}

const FAVORITE_STORAGE_PREFIX = 'agile-tools:favorite-scopes';

const controlsGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  alignItems: 'end',
  justifyContent: 'flex-end',
  width: 'min(100%, 42rem)',
};

const searchFieldStyle: CSSProperties = {
  flex: '1 1 14rem',
  minWidth: 'min(100%, 14rem)',
};

const statusFieldStyle: CSSProperties = {
  flex: '0 1 11rem',
  minWidth: 'min(100%, 11rem)',
};

const iconButtonStyle: CSSProperties = {
  width: '2.35rem',
  height: '2.35rem',
  flex: '0 0 2.35rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '9999px',
  border: `1px solid ${palette.lineStrong}`,
  background: palette.panelStrong,
  color: palette.soft,
  cursor: 'pointer',
  transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease',
};

const activeIconButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  color: palette.warning,
  background: palette.warningSoft,
  borderColor: 'transparent',
};

function getStorageKey(workspaceId: string): string {
  return `${FAVORITE_STORAGE_PREFIX}:${workspaceId}`;
}

function readFavoriteIds(storageKey: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavoriteIds(storageKey: string, favoriteIds: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(favoriteIds));
  } catch {
    // Favorites still update in memory when browser storage is disabled or full.
  }
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string): 'neutral' | 'info' | 'positive' | 'warning' | 'danger' {
  if (status === 'active') return 'positive';
  if (status === 'paused') return 'warning';
  if (status === 'needs_attention') return 'danger';
  return 'neutral';
}

function scopeSearchText(scope: HomeScopeSummary): string {
  return [
    scope.boardName,
    scope.boardId,
    `Board ${scope.boardId}`,
    scope.status,
    formatStatus(scope.status),
    scope.timezone,
    scope.includedIssueTypeNames.join(' '),
  ].join(' ');
}

export function ScopeDirectory({ workspaceId, scopes }: ScopeDirectoryProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const storageKey = useMemo(() => getStorageKey(workspaceId), [workspaceId]);

  useEffect(() => {
    const available = new Set(scopes.map((scope) => scope.id));
    const stored = readFavoriteIds(storageKey);
    const pruned = stored.filter((scopeId) => available.has(scopeId));

    setFavoriteIds(pruned);
    if (stored.length !== pruned.length) {
      writeFavoriteIds(storageKey, pruned);
    }
  }, [scopes, storageKey]);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteCount = useMemo(
    () => scopes.filter((scope) => favoriteIdSet.has(scope.id)).length,
    [favoriteIdSet, scopes],
  );

  const statusOptions = useMemo(() => {
    return Array.from(new Set(scopes.map((scope) => scope.status))).sort((a, b) =>
      formatStatus(a).localeCompare(formatStatus(b)),
    );
  }, [scopes]);

  const filteredScopes = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const originalIndexById = new Map(scopes.map((scope, index) => [scope.id, index]));

    return scopes
      .filter((scope) => {
        if (statusFilter !== 'all' && scope.status !== statusFilter) return false;
        if (favoritesOnly && !favoriteIdSet.has(scope.id)) return false;
        if (!normalizedQuery) return true;

        return normalizeSearch(scopeSearchText(scope)).includes(normalizedQuery);
      })
      .sort((a, b) => {
        const favoriteDelta = Number(favoriteIdSet.has(b.id)) - Number(favoriteIdSet.has(a.id));
        if (favoriteDelta !== 0) return favoriteDelta;

        return (originalIndexById.get(a.id) ?? 0) - (originalIndexById.get(b.id) ?? 0);
      });
  }, [favoriteIdSet, favoritesOnly, query, scopes, statusFilter]);

  function toggleFavorite(scopeId: string): void {
    setFavoriteIds((current) => {
      const next = current.includes(scopeId)
        ? current.filter((favoriteId) => favoriteId !== scopeId)
        : [scopeId, ...current];

      writeFavoriteIds(storageKey, next);
      return next;
    });
  }

  function clearFilters(): void {
    setQuery('');
    setStatusFilter('all');
    setFavoritesOnly(false);
  }

  return (
    <>
      <div style={sectionHeaderRowStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Available scopes</h2>
          {scopes.length > 0 && (
            <p style={sectionCopyStyle}>
              {filteredScopes.length} of {scopes.length} shown
              {favoriteCount > 0 ? ` · ${favoriteCount} favorite${favoriteCount === 1 ? '' : 's'}` : ''}
            </p>
          )}
        </div>
        {scopes.length > 0 && (
          <div style={controlsGridStyle}>
            <label style={searchFieldStyle}>
              <span style={fieldLabelStyle}>Search</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Board, status, issue type"
                aria-label="Search scopes"
                style={inputStyle}
              />
            </label>
            <label style={statusFieldStyle}>
              <span style={fieldLabelStyle}>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter scopes by status"
                style={{ ...selectStyle, minWidth: '10rem' }}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...checkboxChipStyle(favoritesOnly), minHeight: '2.9rem', alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
                aria-label="Show favorite scopes only"
              />
              Favorites
            </label>
          </div>
        )}
      </div>

      {scopes.length === 0 ? (
        <p style={sectionCopyStyle}>No scopes are configured in this workspace yet.</p>
      ) : filteredScopes.length === 0 ? (
        <div style={{ ...itemCardStyle, textAlign: 'center' }}>
          <p style={{ ...sectionCopyStyle, marginTop: 0 }}>No scopes match the current view.</p>
          <button
            type="button"
            onClick={clearFilters}
            style={{ ...buttonStyle('secondary'), marginTop: '0.85rem' }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul style={{ ...sectionStackStyle, listStyle: 'none', padding: 0 }}>
          {filteredScopes.map((scope) => {
            const favorite = favoriteIdSet.has(scope.id);
            const title = scope.boardName || `Board ${scope.boardId}`;

            return (
              <li
                key={scope.id}
                style={{
                  ...itemCardStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', minWidth: 0, flex: '1 1 18rem' }}>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(scope.id)}
                    aria-label={`${favorite ? 'Remove' : 'Add'} ${title} ${favorite ? 'from' : 'to'} favorites`}
                    aria-pressed={favorite}
                    title={`${favorite ? 'Remove from' : 'Add to'} favorites`}
                    style={favorite ? activeIconButtonStyle : iconButtonStyle}
                  >
                    <StarIcon filled={favorite} />
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <h3 style={{ ...sectionTitleStyle, fontSize: '1.2rem', wordBreak: 'break-word' }}>
                        {title}
                      </h3>
                      <span style={tonePillStyle(statusTone(scope.status))}>{formatStatus(scope.status)}</span>
                    </div>
                    <p style={{ ...sectionCopyStyle, marginTop: '0.5rem' }}>
                      Board {scope.boardId} · every {scope.syncIntervalMinutes} minutes · {scope.timezone}
                    </p>
                    {scope.includedIssueTypeNames.length > 0 && (
                      <p style={helperTextStyle}>
                        {scope.includedIssueTypeNames.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <a href={`/scopes/${scope.id}`} style={linkStyle}>
                    Scope →
                  </a>
                  <a href={`/scopes/${scope.id}/forecast`} style={linkStyle}>
                    Forecast →
                  </a>
                  {scope.jiraDashboardUrl && (
                    <a
                      href={scope.jiraDashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={linkStyle}
                    >
                      Jira dashboard ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 2.9 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9L6.4 20l1.1-6.2L3 9.4l6.2-.9L12 2.9Z" />
    </svg>
  );
}
