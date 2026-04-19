'use client';

import { useState, type FormEvent } from 'react';
import type { ForecastRequest } from '@agile-tools/shared/contracts/forecast';
import { buttonStyle, checkboxChipStyle, fieldLabelStyle, insetPanelStyle, noticeStyle, inputStyle, selectStyle } from '@/components/app/chrome';

interface ForecastFormProps {
  onSubmit: (request: ForecastRequest) => void;
  disabled?: boolean;
  historicalWindowOptions?: number[];
}

const DEFAULT_WINDOWS = [30, 60, 90, 180, 365];
const CONFIDENCE_OPTIONS = [50, 70, 85, 95];

/** Returns today's date as YYYY-MM-DD + offset days (for default target date). */
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ForecastForm({
  onSubmit,
  disabled,
  historicalWindowOptions,
}: ForecastFormProps) {
  const [type, setType] = useState<'when' | 'how_many'>('when');
  const [remainingStoryCount, setRemainingStoryCount] = useState(10);
  const [targetDate, setTargetDate] = useState(dateOffset(30));
  const [historicalWindowDays, setHistoricalWindowDays] = useState(90);
  const [confidenceLevels, setConfidenceLevels] = useState<number[]>([50, 70, 85, 95]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const windows = historicalWindowOptions ?? DEFAULT_WINDOWS;

  function toggleConfidence(level: number) {
    setConfidenceLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level].sort((a, b) => a - b),
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);

    if (confidenceLevels.length === 0) {
      setValidationError('Select at least one confidence level.');
      return;
    }

    if (type === 'when') {
      if (remainingStoryCount < 1) {
        setValidationError('Remaining story count must be at least 1.');
        return;
      }
      onSubmit({ type: 'when', remainingStoryCount, historicalWindowDays, confidenceLevels });
    } else {
      if (!targetDate) {
        setValidationError('Target date is required.');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (targetDate <= today) {
        setValidationError('Target date must be in the future.');
        return;
      }
      onSubmit({ type: 'how_many', targetDate, historicalWindowDays, confidenceLevels });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ ...insetPanelStyle, fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}
    >
      {/* Forecast type */}
      <div>
        <p style={{ ...fieldLabelStyle, margin: '0 0 0.5rem' }}>Forecast Type</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={checkboxChipStyle(type === 'when')}>
            <input
              type="radio"
              name="forecast-type"
              value="when"
              checked={type === 'when'}
              onChange={() => setType('when')}
              disabled={disabled}
              style={{ accentColor: '#1d4ed8' }}
              aria-label="When will we finish?"
            />
            When will we finish?
          </label>
          <label style={checkboxChipStyle(type === 'how_many')}>
            <input
              type="radio"
              name="forecast-type"
              value="how_many"
              checked={type === 'how_many'}
              onChange={() => setType('how_many')}
              disabled={disabled}
              style={{ accentColor: '#1d4ed8' }}
              aria-label="How many stories by a date?"
            />
            How many by a date?
          </label>
        </div>
      </div>

      {/* Type-specific input */}
      {type === 'when' ? (
        <div>
          <label
            htmlFor="remaining-stories"
            style={{ ...fieldLabelStyle, marginBottom: '0.35rem' }}
          >
            Remaining story count
          </label>
          <input
            id="remaining-stories"
            type="number"
            min={1}
            value={remainingStoryCount}
            onChange={(e) => setRemainingStoryCount(Number(e.target.value))}
            disabled={disabled}
            style={{ ...inputStyle, maxWidth: '8rem' }}
            aria-label="Number of remaining stories"
          />
        </div>
      ) : (
        <div>
          <label
            htmlFor="target-date"
            style={{ ...fieldLabelStyle, marginBottom: '0.35rem' }}
          >
            Target date
          </label>
          <input
            id="target-date"
            type="date"
            value={targetDate}
            min={dateOffset(1)}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={disabled}
            style={{ ...inputStyle, maxWidth: '14rem' }}
            aria-label="Target completion date"
          />
        </div>
      )}

      {/* Historical window */}
      <div>
        <label
          htmlFor="forecast-window"
          style={{ ...fieldLabelStyle, marginBottom: '0.35rem' }}
        >
          Historical window
        </label>
        <select
          id="forecast-window"
          value={historicalWindowDays}
          onChange={(e) => setHistoricalWindowDays(Number(e.target.value))}
          disabled={disabled}
          style={{ ...selectStyle, maxWidth: '11rem' }}
          aria-label="Historical window in days"
        >
          {windows.map((w) => (
            <option key={w} value={w}>
              {w} days
            </option>
          ))}
        </select>
      </div>

      {/* Confidence levels */}
      <div>
        <p style={{ ...fieldLabelStyle, margin: '0 0 0.5rem' }}>Confidence Levels</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
          {CONFIDENCE_OPTIONS.map((level) => (
            <label
              key={level}
              style={checkboxChipStyle(confidenceLevels.includes(level))}
            >
              <input
                type="checkbox"
                checked={confidenceLevels.includes(level)}
                onChange={() => toggleConfidence(level)}
                disabled={disabled}
                style={{ accentColor: '#1d4ed8' }}
                aria-label={`${level}% confidence`}
              />
              {level}%
            </label>
          ))}
        </div>
      </div>

      {validationError && (
        <div style={noticeStyle('danger')}><p style={{ margin: 0, fontSize: '0.8125rem' }}>{validationError}</p></div>
      )}

      <div>
        <button
          type="submit"
          disabled={disabled}
          style={buttonStyle('primary', Boolean(disabled))}
        >
          Run Forecast
        </button>
      </div>
    </form>
  );
}
