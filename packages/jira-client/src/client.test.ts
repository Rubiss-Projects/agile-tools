import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  JiraClientError,
  createJiraClient as createClient,
  inferChangelogFetchStrategyFromServerInfo,
} from './client.js';

import { JiraRateLimiter, createMemoryJiraRateStore } from '@agile-tools/shared';
function createJiraClient(...[baseUrl, pat, options]: Parameters<typeof createClient>) {
  return createClient(baseUrl, pat, { ...options, rateLimiter: new JiraRateLimiter(createMemoryJiraRateStore()) });
}
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createJiraClient', () => {
  it('pauses on Retry-After: 0 and retries the same request after refill', async () => {
    vi.useFakeTimers();
    const headers = { 'X-RateLimit-Limit': '240', 'X-RateLimit-Remaining': '0', 'X-RateLimit-FillRate': '120', 'X-RateLimit-Interval-Seconds': '60', 'Retry-After': '0' };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429, headers }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createJiraClient('https://fake.test', 'test');
    const promise = client.get('/rest/api/2/issue/1');
    await vi.advanceTimersByTimeAsync(48_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(client.stats).toMatchObject({ requests: 2, rateLimited: 1, pausedMs: 49_000 });
  });

  it('reports RATE_LIMITED when elapsed retry time is exhausted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })));
    const client = createJiraClient('https://fake.test', 'test', { retryBudgetMs: 1000 });
    const assertion = expect(client.get('/rest/api/2/issue/1')).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
    await vi.runAllTimersAsync();
    await assertion;
  });
  it('normalizes the base URL and forwards auth and query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal/', 'pat-123');
    const result = await client.get<{ ok: boolean }>('/rest/api/2/myself', {
      params: { maxResults: 1, includeInactive: false },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://jira.example.internal/rest/api/2/myself?maxResults=1&includeInactive=false',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pat-123',
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('aborts immediately on unauthorized responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal', 'pat-123');

    await expect(client.get('/rest/api/2/myself')).rejects.toMatchObject({
      message: expect.stringContaining('Jira API error 401'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient HTTP failures before succeeding', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 500 }))
      .mockResolvedValueOnce(new Response('still failing', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal', 'pat-123');
    const promise = client.get<{ ok: boolean }>('/rest/api/2/serverInfo');

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('JiraClient.validateConnection', () => {
  it('checks identity, board access, and server info in sequence', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ accountId: 'user-1' }))
      .mockResolvedValueOnce(jsonResponse({ values: [{ id: 1 }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          version: '9.12.0',
          deploymentType: 'Server',
          baseUrl: 'https://jira.example.internal',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal/', 'pat-123');
    const info = await client.validateConnection();

    expect(info).toEqual({
      version: '9.12.0',
      deploymentType: 'Server',
      baseUrl: 'https://jira.example.internal',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://jira.example.internal/rest/api/2/myself',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://jira.example.internal/rest/agile/1.0/board?type=kanban&maxResults=1',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://jira.example.internal/rest/api/2/serverInfo',
      expect.any(Object),
    );
  });

  it('throws when Jira does not return an identity for the PAT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal', 'pat-123');

    const promise = client.validateConnection();

    await expect(promise).rejects.toBeInstanceOf(JiraClientError);
    await expect(promise).rejects.toMatchObject({
      code: 'unauthorized',
      statusCode: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('inferChangelogFetchStrategyFromServerInfo', () => {
  it('selects issue expansion for Jira Server versions before 8.3', () => {
    expect(
      inferChangelogFetchStrategyFromServerInfo({
        version: '8.2.6',
        deploymentType: 'Server',
      }),
    ).toBe('issue_expand');
    expect(
      inferChangelogFetchStrategyFromServerInfo({
        version: '7.13.18',
        deploymentType: 'Server',
      }),
    ).toBe('issue_expand');
  });

  it('selects the changelog subresource for modern Server and Cloud deployments', () => {
    expect(
      inferChangelogFetchStrategyFromServerInfo({
        version: '8.3.0',
        deploymentType: 'Server',
      }),
    ).toBe('subresource');
    expect(
      inferChangelogFetchStrategyFromServerInfo({
        version: '1001.0.0',
        deploymentType: 'Cloud',
      }),
    ).toBe('subresource');
  });
});
