'use client';

import type { ForecastResponse, ForecastResult } from '@agile-tools/shared/contracts/forecast';
import { codeStyle, insetPanelStyle, noticeStyle, palette, statCardStyle, statLabelStyle, statValueStyle } from '@/components/app/chrome';

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
        <div style={{ ...(hasLowSample ? noticeStyle('danger') : noticeStyle('warning')), marginBottom: '0.85rem' }}>
          {warnings.map((w, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0', color: hasLowSample ? palette.danger : palette.warning }}>
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.85rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} aria-label="Forecast results">
          {results.map((r) => (
            <article key={r.confidenceLevel} style={statCardStyle}>
              <p style={statLabelStyle}>Confidence</p>
              <p style={statValueStyle}>{r.confidenceLevel}%</p>
              <p style={{ margin: '0.4rem 0 0', color: palette.muted, lineHeight: 1.5 }}>
                {type === 'when' ? 'Completion date' : 'Stories completed'}
              </p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '1rem', fontWeight: 700, color: palette.ink }}>
                {formatResult(r, type)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p style={{ color: palette.soft, margin: 0 }}>
          No forecast results available. This usually means there is no throughput history in the
          selected window.
        </p>
      )}

      {/* Metadata */}
      <div
        style={{
          ...insetPanelStyle,
          marginTop: '0.85rem',
          color: palette.soft,
          fontSize: '0.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <span>
          Sample size: <strong style={{ color: palette.text }}>{sampleSize} stories</strong>
        </span>
        <span>
          Iterations: <strong style={{ color: palette.text }}>{iterations.toLocaleString()}</strong>
        </span>
        <span>
          Window: <strong style={{ color: palette.text }}>{historicalWindowDays} days</strong>
        </span>
        <span>
          Data version: <span style={codeStyle}>{dataVersion || '—'}</span>
        </span>
      </div>
    </div>
  );
}
