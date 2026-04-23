// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FlowAnalyticsSection } from './flow-analytics-section';

vi.mock('./aging-scatter-plot', () => ({
  AgingScatterPlot: () => null,
}));

vi.mock('./work-item-detail-drawer', () => ({
  WorkItemDetailDrawer: () => null,
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FlowAnalyticsSection', () => {
  it('expands a grouped status selection into all matching status ids', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        scopeId: '11111111-1111-4111-8111-111111111111',
        dataVersion: 'sync-1',
        syncedAt: new Date('2026-04-19T12:00:00Z').toISOString(),
        historicalWindowDays: 90,
        sampleSize: 0,
        warnings: [],
        agingModel: {
          metricBasis: 'cycle_time',
          p50: 0,
          p70: 0,
          p85: 0,
          sampleSize: 0,
          lowConfidenceReason: 'No completed stories in history.',
        },
        points: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FlowAnalyticsSection
        scopeId="11111111-1111-4111-8111-111111111111"
        filterOptions={{
          historicalWindows: [30, 60, 90, 180],
          statuses: [
            { id: '10', name: 'Backlog' },
            { id: '11', name: 'Backlog' },
            { id: '20', name: 'In Progress' },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('checkbox', { name: /filter by status backlog/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const requestUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(requestUrl).toContain('historicalWindowDays=90');
    expect(requestUrl).toContain('statusIds=10');
    expect(requestUrl).toContain('statusIds=11');
    expect(requestUrl).not.toContain('statusIds=20');
  });
});
