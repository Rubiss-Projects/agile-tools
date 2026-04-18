'use client';

import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import type {
  ScatterPlotLayerProps,
  ScatterPlotNodeData,
} from '@nivo/scatterplot';
import type { ScatterDatum, FlowAnalyticsViewModel } from '@/server/views/flow-analytics';
import type { AgingModel } from '@agile-tools/shared/contracts/api';

const ZONE_COLORS: Record<string, string> = {
  normal: '#22c55e',
  watch: '#f59e0b',
  aging: '#ef4444',
};

/** Render dashed vertical reference lines at the p50, p70, and p85 thresholds. */
function createThresholdLayer(agingModel: AgingModel) {
  return function ThresholdLines({
    xScale,
    innerHeight,
  }: ScatterPlotLayerProps<ScatterDatum>) {
    const thresholds = [
      { value: agingModel.p50, label: 'p50', color: '#22c55e' },
      { value: agingModel.p70, label: 'p70', color: '#f59e0b' },
      { value: agingModel.p85, label: 'p85', color: '#ef4444' },
    ].filter((t) => t.value > 0);

    if (thresholds.length === 0) return null;

    const scale = xScale as (v: number) => number;

    return (
      <>
        {thresholds.map((t) => {
          const x = scale(t.value);
          return (
            <g key={t.label}>
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={innerHeight}
                stroke={t.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.75}
              />
              <text x={x + 3} y={14} fontSize={10} fill={t.color} opacity={0.9}>
                {t.label}
              </text>
            </g>
          );
        })}
      </>
    );
  };
}

interface AgingScatterPlotProps {
  viewModel: FlowAnalyticsViewModel;
  onItemSelect?: (workItemId: string, issueKey: string) => void;
  height?: number;
}

export function AgingScatterPlot({
  viewModel,
  onItemSelect,
  height = 360,
}: AgingScatterPlotProps) {
  const { series, agingModel } = viewModel;
  const isEmpty = series.every((s) => s.data.length === 0);

  // Recreated on every render; fine because agingModel only changes on new data loads.
  const thresholdLayer = createThresholdLayer(agingModel);

  if (isEmpty) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: '0.875rem',
          border: '1px dashed #e5e7eb',
          borderRadius: '4px',
        }}
      >
        No active work items to display.
      </div>
    );
  }

  return (
    <div style={{ height }} aria-label="Aging scatter plot">
      <ResponsiveScatterPlot<ScatterDatum>
        data={series}
        margin={{ top: 20, right: 20, bottom: 52, left: 50 }}
        xScale={{ type: 'linear', min: 0, max: 'auto' }}
        yScale={{ type: 'linear', min: -1, max: 'auto' }}
        axisBottom={{
          legend: 'Age (days)',
          legendOffset: 42,
          legendPosition: 'middle',
        }}
        axisLeft={null}
        enableGridY={false}
        colors={({ serieId }: { serieId: string | number }) =>
          ZONE_COLORS[String(serieId)] ?? '#94a3b8'
        }
        nodeSize={10}
        useMesh={true}
        layers={[
          'grid',
          'axes',
          thresholdLayer,
          'nodes',
          'mesh',
          'legends',
          'annotations',
        ]}
        tooltip={({ node }: { node: ScatterPlotNodeData<ScatterDatum> }) => {
          const d = node.data;
          return (
            <div
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                maxWidth: '18rem',
              }}
            >
              <strong>{d.issueKey}</strong>
              <br />
              <span style={{ color: '#374151' }}>{d.summary}</span>
              <br />
              <span style={{ color: '#6b7280' }}>
                Age: {node.xValue.toFixed(1)}d
              </span>
              {d.onHoldNow && (
                <span style={{ marginLeft: '0.5rem', color: '#6366f1' }}>● On hold</span>
              )}
            </div>
          );
        }}
        onClick={(node: ScatterPlotNodeData<ScatterDatum>) => {
          onItemSelect?.(node.data.workItemId, node.data.issueKey);
        }}
        ariaLabel="Aging scatter plot"
      />
    </div>
  );
}
