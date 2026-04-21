'use client';

import { checkboxChipStyle, fieldLabelStyle, insetPanelStyle, selectStyle, selectionControlStyle } from '@/components/app/chrome';

/** Active filter state passed around between FlowFiltersPanel and consumers. */
export interface FlowFilters {
  historicalWindowDays: number;
  issueTypeIds: string[];
  statusIds: string[];
  agingOnly: boolean;
  onHoldOnly: boolean;
}

export interface FilterOptions {
  issueTypes?: Array<{ id: string; name: string }>;
  statuses?: Array<{ id: string; name: string }>;
  historicalWindows?: number[];
}

interface FlowFiltersPanelProps {
  filterOptions: FilterOptions;
  filters: FlowFilters;
  onChange: (filters: FlowFilters) => void;
  disabled?: boolean;
}

const DEFAULT_WINDOWS = [30, 60, 90, 180];

export function FlowFiltersPanel({
  filterOptions,
  filters,
  onChange,
  disabled,
}: FlowFiltersPanelProps) {
  function toggle(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  return (
    <div
      style={{
        ...insetPanelStyle,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-start',
        fontSize: '0.875rem',
      }}
    >
      {/* Timeframe picker */}
      <div>
        <label
          htmlFor="flow-timeframe"
          style={{ ...fieldLabelStyle, marginBottom: '0.35rem' }}
        >
          Timeframe
        </label>
        <select
          id="flow-timeframe"
          value={filters.historicalWindowDays}
          onChange={(e) => onChange({ ...filters, historicalWindowDays: Number(e.target.value) })}
          disabled={disabled}
          style={{ ...selectStyle, minWidth: '7rem', width: 'auto', padding: '0.65rem 0.85rem' }}
          aria-label="Historical timeframe"
        >
          {(filterOptions.historicalWindows ?? DEFAULT_WINDOWS).map((w) => (
            <option key={w} value={w}>
              {w}d
            </option>
          ))}
        </select>
      </div>

      {/* Issue-type checkboxes */}
      {filterOptions.issueTypes && filterOptions.issueTypes.length > 0 && (
        <div>
          <p style={{ ...fieldLabelStyle, margin: '0 0 0.35rem' }}>
            Issue Types
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {filterOptions.issueTypes.map((t) => (
              <label
                key={t.id}
                style={checkboxChipStyle(filters.issueTypeIds.includes(t.id))}
              >
                <input
                  type="checkbox"
                  checked={filters.issueTypeIds.includes(t.id)}
                  onChange={() =>
                    onChange({ ...filters, issueTypeIds: toggle(filters.issueTypeIds, t.id) })
                  }
                  disabled={disabled}
                  style={selectionControlStyle}
                  aria-label={`Filter by ${t.name}`}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Workflow-status checkboxes */}
      {filterOptions.statuses && filterOptions.statuses.length > 0 && (
        <div>
          <p style={{ ...fieldLabelStyle, margin: '0 0 0.35rem' }}>Status</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {filterOptions.statuses.map((s) => (
              <label
                key={s.id}
                style={checkboxChipStyle(filters.statusIds.includes(s.id))}
              >
                <input
                  type="checkbox"
                  checked={filters.statusIds.includes(s.id)}
                  onChange={() =>
                    onChange({ ...filters, statusIds: toggle(filters.statusIds, s.id) })
                  }
                  disabled={disabled}
                  style={selectionControlStyle}
                  aria-label={`Filter by status ${s.name}`}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Aging / on-hold toggles */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <label style={checkboxChipStyle(filters.agingOnly)}>
          <input
            type="checkbox"
            checked={filters.agingOnly}
            onChange={(e) => onChange({ ...filters, agingOnly: e.target.checked })}
            disabled={disabled}
            style={selectionControlStyle}
          />
          Aging only
        </label>
        <label style={checkboxChipStyle(filters.onHoldOnly)}>
          <input
            type="checkbox"
            checked={filters.onHoldOnly}
            onChange={(e) => onChange({ ...filters, onHoldOnly: e.target.checked })}
            disabled={disabled}
            style={selectionControlStyle}
          />
          On-hold only
        </label>
      </div>
    </div>
  );
}
