import type { FlowAnalyticsResponse, AgingModel } from '@agile-tools/shared/contracts/api';

/** A single datum on the aging scatter plot. */
export interface ScatterDatum {
  x: number; // ageDays — the X axis value
  y: number; // stable ordinal index (0-based, sorted by ageDays descending)
  workItemId: string;
  issueKey: string;
  summary: string;
  issueType?: string;
  currentStatus: string;
  currentColumn?: string;
  assigneeName?: string;
  onHoldNow: boolean;
  agingZone: 'normal' | 'watch' | 'aging';
  jiraUrl?: string;
}

/** Scatter data grouped by aging zone for per-series colour coding. */
export interface FlowAnalyticsSeries {
  id: 'normal' | 'watch' | 'aging';
  data: ScatterDatum[];
}

/** View model consumed by AgingScatterPlot and FlowAnalyticsSection. */
export interface FlowAnalyticsViewModel {
  series: FlowAnalyticsSeries[];
  agingModel: AgingModel;
  sampleSize: number;
  dataVersion: string;
  syncedAt: string;
}

/**
 * Shape a FlowAnalyticsResponse into the view model consumed by
 * AgingScatterPlot.
 *
 * Assigns stable Y ordinals by sorting points in ageDays-descending order
 * so the oldest items appear at the top of the chart.
 */
export function shapeFlowAnalytics(response: FlowAnalyticsResponse): FlowAnalyticsViewModel {
  const sorted = [...response.points].sort((a, b) => b.ageDays - a.ageDays);

  const byZone: Record<'normal' | 'watch' | 'aging', ScatterDatum[]> = {
    normal: [],
    watch: [],
    aging: [],
  };

  sorted.forEach((point, index) => {
    const datum: ScatterDatum = {
      x: point.ageDays,
      y: index,
      workItemId: point.workItemId,
      issueKey: point.issueKey,
      summary: point.summary,
      ...(point.issueType ? { issueType: point.issueType } : {}),
      currentStatus: point.currentStatus,
      ...(point.currentColumn ? { currentColumn: point.currentColumn } : {}),
      ...(point.assigneeName ? { assigneeName: point.assigneeName } : {}),
      onHoldNow: point.onHoldNow,
      agingZone: point.agingZone,
      ...(point.jiraUrl ? { jiraUrl: point.jiraUrl } : {}),
    };
    byZone[point.agingZone].push(datum);
  });

  return {
    series: [
      { id: 'normal', data: byZone.normal },
      { id: 'watch', data: byZone.watch },
      { id: 'aging', data: byZone.aging },
    ],
    agingModel: response.agingModel,
    sampleSize: response.sampleSize,
    dataVersion: response.dataVersion,
    syncedAt: response.syncedAt,
  };
}
