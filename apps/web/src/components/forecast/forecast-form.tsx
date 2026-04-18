'use client';

import { useState, type FormEvent } from 'react';
import type { ForecastRequest } from '@agile-tools/shared/contracts/forecast';

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
      style={{
        padding: '0.75rem 1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '4px',
        fontSize: '0.875rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}
    >
      {/* Forecast type */}
      <div>
        <p style={{ margin: '0 0 0.375rem', fontWeight: 500 }}>Forecast Type</p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="forecast-type"
              value="when"
              checked={type === 'when'}
              onChange={() => setType('when')}
              disabled={disabled}
              aria-label="When will we finish?"
            />
            When will we finish?
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="forecast-type"
              value="how_many"
              checked={type === 'how_many'}
              onChange={() => setType('how_many')}
              disabled={disabled}
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
            style={{ display: 'block', marginBottom: '0.25rem', color: '#374151' }}
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
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '6rem' }}
            aria-label="Number of remaining stories"
          />
        </div>
      ) : (
        <div>
          <label
            htmlFor="target-date"
            style={{ display: 'block', marginBottom: '0.25rem', color: '#374151' }}
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
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            aria-label="Target completion date"
          />
        </div>
      )}

      {/* Historical window */}
      <div>
        <label
          htmlFor="forecast-window"
          style={{ display: 'block', marginBottom: '0.25rem', color: '#374151' }}
        >
          Historical window
        </label>
        <select
          id="forecast-window"
          value={historicalWindowDays}
          onChange={(e) => setHistoricalWindowDays(Number(e.target.value))}
          disabled={disabled}
          style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
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
        <p style={{ margin: '0 0 0.375rem', color: '#374151' }}>Confidence levels</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
          {CONFIDENCE_OPTIONS.map((level) => (
            <label
              key={level}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={confidenceLevels.includes(level)}
                onChange={() => toggleConfidence(level)}
                disabled={disabled}
                aria-label={`${level}% confidence`}
              />
              {level}%
            </label>
          ))}
        </div>
      </div>

      {validationError && (
        <p style={{ margin: 0, color: 'red', fontSize: '0.8125rem' }}>{validationError}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: '0.4375rem 1rem',
            fontSize: '0.875rem',
            background: disabled ? '#e5e7eb' : '#1d4ed8',
            color: disabled ? '#6b7280' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Run Forecast
        </button>
      </div>
    </form>
  );
}
