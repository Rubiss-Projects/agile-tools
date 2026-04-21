import { afterEach, describe, expect, it, vi } from 'vitest';

import { createJiraClient } from './client.js';
import { fetchIssueChangelog } from './issues.js';

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

describe('fetchIssueChangelog', () => {
  it('paginates the changelog subresource when it is available', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `cl-${index + 1}`,
      created: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      items: [{ field: 'status', from: '1', to: '2' }],
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          startAt: 0,
          maxResults: 100,
          total: 101,
          values: firstPage,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          startAt: 100,
          maxResults: 100,
          total: 101,
          values: [
            {
              id: 'cl-101',
              created: '2026-02-01T00:00:00.000Z',
              items: [{ field: 'status', from: '2', to: '3' }],
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal', 'pat-123');
    const histories = await fetchIssueChangelog(client, 'PROJ-1');

    expect(histories).toHaveLength(101);
    expect(histories[0]?.id).toBe('cl-1');
    expect(histories[100]?.id).toBe('cl-101');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://jira.example.internal/rest/api/2/issue/PROJ-1/changelog?startAt=0&maxResults=100',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://jira.example.internal/rest/api/2/issue/PROJ-1/changelog?startAt=100&maxResults=100',
      expect.any(Object),
    );
  });

  it('falls back to issue expansion when the changelog subresource returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          changelog: {
            startAt: 0,
            maxResults: 2,
            total: 2,
            histories: [
              {
                id: 'cl-1',
                created: '2026-01-02T00:00:00.000Z',
                items: [{ field: 'status', from: '1', to: '2' }],
              },
              {
                id: 'cl-2',
                created: '2026-01-03T00:00:00.000Z',
                items: [{ field: 'status', from: '2', to: '3' }],
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createJiraClient('https://jira.example.internal', 'pat-123');
    const histories = await fetchIssueChangelog(client, 'PROJ-1');

    expect(histories.map((history) => history.id)).toEqual(['cl-1', 'cl-2']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://jira.example.internal/rest/api/2/issue/PROJ-1/changelog?startAt=0&maxResults=100',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://jira.example.internal/rest/api/2/issue/PROJ-1?expand=changelog&fields=summary',
      expect.any(Object),
    );
  });
});