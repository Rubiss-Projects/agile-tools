import { describe, expect, it } from 'vitest';

import { shapeFlowAnalytics } from './flow-analytics';
import type { FlowAnalyticsResponse } from '@agile-tools/shared/contracts/api';

function response(overrides?: Partial<FlowAnalyticsResponse>): FlowAnalyticsResponse {
  return {
    scopeId: '11111111-1111-4111-8111-111111111111',
    dataVersion: 'sync-1',
    syncedAt: new Date('2026-06-02T12:00:00Z').toISOString(),
    historicalWindowDays: 90,
    sampleSize: 1,
    warnings: [],
    agingModel: {
      metricBasis: 'cycle_time',
      p50: 7,
      p70: 10,
      p85: 14,
      sampleSize: 40,
    },
    columnAgingModels: [
      {
        columnName: 'Selected for Development',
        statusIds: ['selected'],
        metricBasis: 'column_working_days',
        p50: 2,
        p70: 4,
        p85: 6,
        sampleSize: 40,
      },
    ],
    points: [
      {
        workItemId: '22222222-2222-4222-8222-222222222222',
        issueKey: 'AGILE-102',
        summary: 'In progress story',
        currentStatus: 'In Progress',
        currentColumn: 'In Progress',
        ageDays: 8,
        agingZone: 'watch',
        currentColumnAgeDays: 5,
        currentColumnAgingZone: 'watch',
        onHoldNow: false,
        columnDurations: [],
      },
    ],
    ...overrides,
  };
}

describe('shapeFlowAnalytics', () => {
  it('keeps active point columns in the visible column order when they are missing from models', () => {
    const viewModel = shapeFlowAnalytics(response());

    expect(viewModel.columnNames).toEqual([
      'Selected for Development',
      'In Progress',
    ]);
    expect(viewModel.columnSeries[1]?.data[0]?.x).toBe(1);
  });
});
