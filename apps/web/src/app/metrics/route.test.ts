import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /metrics', () => {
  it('returns OpenTelemetry metrics in Prometheus text format', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toContain('# TYPE agile_tools_metrics_scrapes_total counter');
    expect(body).toMatch(/agile_tools_metrics_scrapes_total \d+/);
    expect(body).toContain('# TYPE agile_tools_process_uptime_seconds gauge');
    expect(body).toContain('# TYPE agile_tools_process_memory_bytes gauge');
  });
});