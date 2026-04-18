'use client';

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
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-start',
        padding: '0.75rem 1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        fontSize: '0.875rem',
      }}
    >
      {/* Timeframe picker */}
      <div>
        <label
          htmlFor="flow-timeframe"
          style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}
        >
          Timeframe
        </label>
        <select
          id="flow-timeframe"
          value={filters.historicalWindowDays}
          onChange={(e) => onChange({ ...filters, historicalWindowDays: Number(e.target.value) })}
          disabled={disabled}
          style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
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
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem' }}>
            Issue Types
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {filterOptions.issueTypes.map((t) => (
              <label
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={filters.issueTypeIds.includes(t.id)}
                  onChange={() =>
                    onChange({ ...filters, issueTypeIds: toggle(filters.issueTypeIds, t.id) })
                  }
                  disabled={disabled}
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
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem' }}>Status</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {filterOptions.statuses.map((s) => (
              <label
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={filters.statusIds.includes(s.id)}
                  onChange={() =>
                    onChange({ ...filters, statusIds: toggle(filters.statusIds, s.id) })
                  }
                  disabled={disabled}
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.agingOnly}
            onChange={(e) => onChange({ ...filters, agingOnly: e.target.checked })}
            disabled={disabled}
          />
          Aging only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.onHoldOnly}
            onChange={(e) => onChange({ ...filters, onHoldOnly: e.target.checked })}
            disabled={disabled}
          />
          On-hold only
        </label>
      </div>
    </div>
  );
}
