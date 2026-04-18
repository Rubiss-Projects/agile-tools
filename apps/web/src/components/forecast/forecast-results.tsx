'use client';

import type { ForecastResponse, ForecastResult } from '@agile-tools/shared/contracts/forecast';

interface ForecastResultsProps {
  response: ForecastResponse;
}

function formatResult(result: ForecastResult, type: 'when' | 'how_many'): string {
  if (type === 'when' && result.completionDate) {
    return new Date(result.completionDate + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (type === 'how_many' && result.completedStoryCount !== undefined) {
    return `${result.completedStoryCount} ${result.completedStoryCount === 1 ? 'story' : 'stories'}`;
  }
  return '—';
}

export function ForecastResults({ response }: ForecastResultsProps) {
  const { type, results, warnings, sampleSize, iterations, dataVersion, historicalWindowDays } =
    response;

  const hasLowSample = warnings.some(
    (w) => w.code === 'LOW_SAMPLE_SIZE' || w.code === 'NO_THROUGHPUT_HISTORY',
  );

  return (
    <div style={{ fontSize: '0.875rem' }}>
      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.625rem 0.875rem',
            background: hasLowSample ? '#fef2f2' : '#fef9c3',
            border: `1px solid ${hasLowSample ? '#fca5a5' : '#fde047'}`,
            borderRadius: '4px',
          }}
        >
          {warnings.map((w, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0', color: hasLowSample ? '#991b1b' : '#92400e' }}>
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 ? (
        <table
          style={{ borderCollapse: 'collapse', width: '100%' }}
          aria-label="Forecast results"
        >
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.375rem 0.75rem 0.375rem 0',
                  color: '#6b7280',
                  fontWeight: 500,
                }}
              >
                Confidence
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.375rem 0.75rem 0.375rem 0.75rem',
                  color: '#6b7280',
                  fontWeight: 500,
                }}
              >
                {type === 'when' ? 'Completion Date' : 'Stories Completed'}
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={r.confidenceLevel}
                style={{ borderBottom: '1px solid #f3f4f6' }}
              >
                <td
                  style={{
                    padding: '0.5rem 0.75rem 0.5rem 0',
                    fontWeight: 600,
                    color: '#1d4ed8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.confidenceLevel}%
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#111827' }}>
                  {formatResult(r, type)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#6b7280', margin: 0 }}>
          No forecast results available. This usually means there is no throughput history in the
          selected window.
        </p>
      )}

      {/* Metadata */}
      <div
        style={{
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          color: '#6b7280',
          fontSize: '0.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <span>
          Sample size: <strong style={{ color: '#374151' }}>{sampleSize} stories</strong>
        </span>
        <span>
          Iterations: <strong style={{ color: '#374151' }}>{iterations.toLocaleString()}</strong>
        </span>
        <span>
          Window: <strong style={{ color: '#374151' }}>{historicalWindowDays} days</strong>
        </span>
        <span>
          Data version: <code style={{ fontSize: '0.6875rem' }}>{dataVersion || '—'}</code>
        </span>
      </div>
    </div>
  );
}
