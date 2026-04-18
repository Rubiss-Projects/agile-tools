'use client';

import { ResponsiveLine } from '@nivo/line';
import type { ThroughputResponse } from '@agile-tools/shared/contracts/api';

interface ThroughputChartProps {
  response: ThroughputResponse;
  height?: number;
}

export function ThroughputChart({ response, height = 200 }: ThroughputChartProps) {
  const { days, sampleSize, historicalWindowDays, warnings } = response;

  if (days.length === 0) {
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
        aria-label="Daily throughput chart"
      >
        No throughput data yet. Sync more data to see history.
      </div>
    );
  }

  const chartData = [
    {
      id: 'stories',
      data: days.map((d) => ({ x: d.day, y: d.completedStoryCount })),
    },
  ];

  // Show every nth tick to avoid label crowding.
  const tickEveryN = Math.max(1, Math.ceil(days.length / 10));
  const tickValues = days.filter((_, i) => i % tickEveryN === 0).map((d) => d.day);

  return (
    <div>
      {warnings.length > 0 && (
        <div
          style={{
            marginBottom: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: '#fef9c3',
            border: '1px solid #fde047',
            borderRadius: '4px',
            fontSize: '0.8125rem',
          }}
        >
          {warnings.map((w, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0' }}>
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}

      <div style={{ height }} aria-label="Daily throughput chart">
        <ResponsiveLine
          data={chartData}
          margin={{ top: 10, right: 20, bottom: 48, left: 40 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false }}
          curve="monotoneX"
          enableArea={true}
          areaOpacity={0.15}
          colors={['#1d4ed8']}
          lineWidth={2}
          pointSize={4}
          pointColor={{ from: 'color' }}
          pointBorderWidth={0}
          enableGridX={false}
          axisBottom={{
            tickValues,
            tickRotation: -45,
            legend: 'Date',
            legendOffset: 44,
            legendPosition: 'middle',
          }}
          axisLeft={{
            tickValues: 5,
            legend: 'Stories',
            legendOffset: -32,
            legendPosition: 'middle',
          }}
          tooltip={({ point }) => (
            <div
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '0.375rem 0.625rem',
                fontSize: '0.8125rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <strong>{String(point.data.x)}</strong>
              <br />
              {Number(point.data.y)} {Number(point.data.y) === 1 ? 'story' : 'stories'}
            </div>
          )}
          useMesh={true}
        />
      </div>

      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
        {sampleSize} stories completed over the last {historicalWindowDays} days
      </p>
    </div>
  );
}
