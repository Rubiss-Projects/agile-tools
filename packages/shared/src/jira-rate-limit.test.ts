import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryJiraRateStore, DEFAULT_JIRA_RATE_SETTINGS, JiraRateLimiter, parseJiraRateHeaders } from './jira-rate-limit.js';

const headers = (remaining = 240) => new Headers({
  'X-RateLimit-Limit': '240', 'X-RateLimit-FillRate': '120',
  'X-RateLimit-Interval-Seconds': '60', 'X-RateLimit-Remaining': String(remaining), 'Retry-After': '0',
});
afterEach(() => vi.useRealTimers());

describe('Jira rate limiting', () => {
  it.each([200, 429])('refills quota independently of a one-request-per-minute budget after HTTP %s', async (status) => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    const limiter = new JiraRateLimiter(createMemoryJiraRateStore(), {
      ...DEFAULT_JIRA_RATE_SETTINGS, requestBudgetPerMinute: 1,
    });
    const state = await limiter.observe(headers(0), status, 0);
    if (status === 429) expect(state.blockedUntil - startedAt).toBe(49_000);
    const starts: number[] = [];
    const requests = (async () => {
      for (let i = 0; i < 2; i++) {
        const release = await limiter.acquire();
        starts.push(Date.now() - startedAt);
        await release();
      }
    })();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(starts).toEqual([60_000]);
    await vi.advanceTimersByTimeAsync(60_000);
    await requests;
    expect(starts).toEqual([60_000, 120_000]);
  });

  it('parses zero remaining, ignores invalid values and treats Retry-After: 0 as unknown', () => {
    expect(parseJiraRateHeaders(headers(0))).toMatchObject({ limit: 240, remaining: 0, fillRate: 120, intervalSeconds: 60, retryAfterMs: 0 });
    expect(parseJiraRateHeaders(new Headers({ 'X-RateLimit-Limit': '-1', 'X-RateLimit-FillRate': 'NaN', 'X-RateLimit-Remaining': '' })))
      .toMatchObject({ limit: undefined, fillRate: undefined, remaining: undefined });
    expect(parseJiraRateHeaders(new Headers({ 'Retry-After': 'Thu, 01 Jan 1970 00:01:00 GMT' }), 0).retryAfterMs).toBe(60_000);
  });

  it('shares pacing across independent clients and leaves reserve despite noisy node headers', async () => {
    vi.useFakeTimers();
    const store = createMemoryJiraRateStore();
    const a = new JiraRateLimiter(store);
    const b = new JiraRateLimiter(store);
    await a.observe(headers(34), 200, 0);
    const afterHighReading = await b.observe(headers(188), 200, 0);
    expect(afterHighReading.remaining).toBe(34);
    let acquired = false;
    const request = b.acquire().then(async (release) => { acquired = true; await release(); });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await request;
    expect(acquired).toBe(true);
  });

  it('waits for reserve refill on a zero Retry-After 429 and honors a longer Retry-After', async () => {
    vi.useFakeTimers();
    const limiter = new JiraRateLimiter(createMemoryJiraRateStore());
    const state = await limiter.observe(headers(0), 429, 0);
    expect(state.blockedUntil - Date.now()).toBeGreaterThanOrEqual(49_000);
    const longer = headers(0); longer.set('Retry-After', '120');
    expect((await limiter.observe(longer, 429, 1)).blockedUntil - Date.now()).toBe(120_000);
  });

  it('keeps 12 concurrent scopes below half of 120/minute for every five-minute window', async () => {
    vi.useFakeTimers();
    const store = createMemoryJiraRateStore();
    const starts: number[] = [];
    let tokens = 240;
    let lastAt = Date.now();
    let rejected = 0;
    const scopes = Array.from({ length: 12 }, async () => {
      const limiter = new JiraRateLimiter(store);
      for (let i = 0; i < 100; i++) {
        const release = await limiter.acquire();
        const now = Date.now();
        tokens = Math.min(240, tokens + (now - lastAt) * 2 / 1000);
        lastAt = now;
        const status = tokens >= 1 ? 200 : 429;
        if (status === 429) rejected++;
        else tokens--;
        starts.push(now);
        await limiter.observe(headers(Math.floor(tokens)), status, 0);
        await release();
      }
    });
    await vi.runAllTimersAsync();
    await Promise.all(scopes);
    expect(rejected).toBe(0);
    expect(starts).toHaveLength(1200);
    for (const start of starts) {
      expect(starts.filter((at) => at >= start && at < start + 300_000).length).toBeLessThanOrEqual(300);
    }
  });
});
