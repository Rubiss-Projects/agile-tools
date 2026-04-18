'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FlowAnalyticsResponse } from '@agile-tools/shared/contracts/api';
import { shapeFlowAnalytics } from '@/server/views/flow-analytics';
import { FlowFiltersPanel } from './flow-filters';
import type { FlowFilters, FilterOptions } from './flow-filters';
import { AgingScatterPlot } from './aging-scatter-plot';
import { WorkItemDetailDrawer } from './work-item-detail-drawer';

interface FlowAnalyticsSectionProps {
  scopeId: string;
  filterOptions: FilterOptions;
}

const DEFAULT_FILTERS: FlowFilters = {
  historicalWindowDays: 90,
  issueTypeIds: [],
  statusIds: [],
  agingOnly: false,
  onHoldOnly: false,
};

export function FlowAnalyticsSection({ scopeId, filterOptions }: FlowAnalyticsSectionProps) {
  const [filters, setFilters] = useState<FlowFilters>({
    ...DEFAULT_FILTERS,
    historicalWindowDays: filterOptions.historicalWindows?.[2] ?? 90,
  });
  const [response, setResponse] = useState<FlowAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected item for the detail drawer.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | undefined>(undefined);

  const fetchFlow = useCallback(
    async (f: FlowFilters) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('historicalWindowDays', String(f.historicalWindowDays));
        f.issueTypeIds.forEach((id) => params.append('issueTypeIds', id));
        f.statusIds.forEach((id) => params.append('statusIds', id));
        if (f.agingOnly) params.set('agingOnly', 'true');
        if (f.onHoldOnly) params.set('onHoldOnly', 'true');

        const res = await fetch(`/api/v1/scopes/${scopeId}/flow?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FlowAnalyticsResponse;
        setResponse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flow analytics.');
      } finally {
        setLoading(false);
      }
    },
    [scopeId],
  );

  useEffect(() => {
    void fetchFlow(filters);
  }, []);

  function handleFilterChange(next: FlowFilters) {
    setFilters(next);
    void fetchFlow(next);
  }

  function handleItemSelect(workItemId: string, issueKey: string) {
    setSelectedItemId(workItemId);
    setSelectedIssueKey(issueKey);
  }

  const viewModel = response ? shapeFlowAnalytics(response) : null;

  return (
    <div>
      {/* Aging model summary */}
      {response && (
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>
          {response.agingModel.sampleSize > 0 ? (
            <span>
              Thresholds (p50 / p70 / p85):{' '}
              <strong style={{ color: '#374151' }}>
                {response.agingModel.p50.toFixed(1)}d / {response.agingModel.p70.toFixed(1)}d / {response.agingModel.p85.toFixed(1)}d
              </strong>{' '}
              from {response.agingModel.sampleSize} completed stories
            </span>
          ) : (
            <span>No aging thresholds yet (sync more data)</span>
          )}
          {response.agingModel.lowConfidenceReason && (
            <span style={{ marginLeft: '0.5rem', color: '#b45309' }}>
              ⚠ {response.agingModel.lowConfidenceReason}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <FlowFiltersPanel
        filterOptions={filterOptions}
        filters={filters}
        onChange={handleFilterChange}
        disabled={loading}
      />

      {/* Warnings from API */}
      {response?.warnings && response.warnings.length > 0 && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          {response.warnings.map((w, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0' }}>
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}

      {/* Scatter plot */}
      <div style={{ marginTop: '0.75rem', position: 'relative' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.7)',
              zIndex: 1,
              borderRadius: '4px',
            }}
          >
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading…</span>
          </div>
        )}
        {error && (
          <p style={{ color: 'red', fontSize: '0.875rem', margin: 0 }}>{error}</p>
        )}
        {viewModel && !error && (
          <AgingScatterPlot
            viewModel={viewModel}
            onItemSelect={handleItemSelect}
          />
        )}
        {!viewModel && !loading && !error && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No data available.</p>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
        {[
          { color: '#22c55e', label: 'Normal (≤ p50)' },
          { color: '#f59e0b', label: 'Watch (p50–p85)' },
          { color: '#ef4444', label: 'Aging (> p85)' },
        ].map((item) => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span
              style={{
                width: '0.75rem',
                height: '0.75rem',
                borderRadius: '50%',
                background: item.color,
                display: 'inline-block',
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* Work item detail drawer */}
      <WorkItemDetailDrawer
        scopeId={scopeId}
        workItemId={selectedItemId}
        {...(selectedIssueKey !== undefined && { issueKey: selectedIssueKey })}
        onClose={() => {
          setSelectedItemId(null);
          setSelectedIssueKey(undefined);
        }}
      />
    </div>
  );
}
