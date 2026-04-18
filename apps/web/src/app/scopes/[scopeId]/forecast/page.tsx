'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { ThroughputResponse } from '@agile-tools/shared/contracts/api';
import type { ForecastResponse, ForecastRequest } from '@agile-tools/shared/contracts/forecast';
import { ThroughputChart } from '@/components/forecast/throughput-chart';
import { ForecastForm } from '@/components/forecast/forecast-form';
import { ForecastResults } from '@/components/forecast/forecast-results';

export default function ForecastPage() {
  const { scopeId } = useParams<{ scopeId: string }>();

  const [throughput, setThroughput] = useState<ThroughputResponse | null>(null);
  const [throughputLoading, setThroughputLoading] = useState(true);
  const [throughputError, setThroughputError] = useState<string | null>(null);

  const [forecastResponse, setForecastResponse] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  useEffect(() => {
    if (!scopeId) return;
    setThroughputLoading(true);
    setThroughputError(null);
    fetch(`/api/v1/scopes/${scopeId}/throughput`)
      .then((res) => {
        if (res.status === 401) throw new Error('Authentication required. Please sign in.');
        if (!res.ok) throw new Error(`Failed to load throughput (HTTP ${res.status}).`);
        return res.json() as Promise<ThroughputResponse>;
      })
      .then((data) => {
        setThroughput(data);
        setThroughputLoading(false);
      })
      .catch((err: unknown) => {
        setThroughputError(err instanceof Error ? err.message : 'Failed to load throughput.');
        setThroughputLoading(false);
      });
  }, [scopeId]);

  async function handleForecast(request: ForecastRequest) {
    setForecastLoading(true);
    setForecastError(null);
    setForecastResponse(null);

    try {
      const body = {
        ...request,
        ...(throughput?.dataVersion ? { dataVersion: throughput.dataVersion } : {}),
      };

      const res = await fetch(`/api/v1/scopes/${scopeId}/forecasts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setForecastResponse(data as ForecastResponse);
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : 'Forecast failed.');
    } finally {
      setForecastLoading(false);
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Navigation */}
      <p style={{ margin: '0 0 1.25rem' }}>
        <a href={`/scopes/${scopeId}`} style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Scope
        </a>
      </p>

      <h1 style={{ margin: '0 0 1.5rem' }}>Forecast</h1>

      {/* Historical throughput */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem' }}>Historical Throughput</h2>
        {throughputLoading && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading throughput data…</p>
        )}
        {throughputError && (
          <p style={{ color: 'red', fontSize: '0.875rem' }}>{throughputError}</p>
        )}
        {throughput && !throughputLoading && (
          <ThroughputChart response={throughput} />
        )}
      </section>

      {/* Forecast form */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem' }}>Run Forecast</h2>
        <ForecastForm
          onSubmit={(req) => { void handleForecast(req); }}
          disabled={forecastLoading || throughputLoading}
          historicalWindowOptions={[30, 60, 90, 180, 365]}
        />
        {forecastLoading && (
          <p style={{ marginTop: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
            Running Monte Carlo simulation…
          </p>
        )}
        {forecastError && (
          <p style={{ marginTop: '0.75rem', color: 'red', fontSize: '0.875rem' }}>
            {forecastError}
          </p>
        )}
      </section>

      {/* Forecast results */}
      {forecastResponse && (
        <section>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem' }}>Results</h2>
          <ForecastResults response={forecastResponse} />
        </section>
      )}
    </main>
  );
}
