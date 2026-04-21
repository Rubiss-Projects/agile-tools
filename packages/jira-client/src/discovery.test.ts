import { afterEach, describe, expect, it, vi } from 'vitest';

import { createJiraClient } from './client.js';
import { getBoardDetail } from './discovery.js';

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
});

describe('getBoardDetail', () => {
  it('keeps off-board completion statuses available when project status discovery fails', async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = String(input);

      if (url.endsWith('/rest/agile/1.0/board/42/configuration')) {
        return Promise.resolve(
          jsonResponse({
            id: 42,
            name: 'Payments Board',
            columnConfig: {
              columns: [
                { name: 'Doing', statuses: [{ id: '20' }] },
                { name: 'Done', statuses: [{ id: '10' }] },
              ],
            },
          }),
        );
      }

      if (url.endsWith('/rest/api/2/status')) {
        return Promise.resolve(
          jsonResponse([
            { id: '30', name: 'Closed' },
            { id: '20', name: 'In Progress' },
            { id: '10', name: 'Done' },
          ]),
        );
      }

      if (url.endsWith('/rest/api/2/issuetype')) {
        return Promise.resolve(
          jsonResponse([
            { id: 'story', name: 'Story' },
            { id: 'bug', name: 'Bug' },
          ]),
        );
      }

      if (url.endsWith('/rest/api/2/field')) {
        return Promise.resolve(jsonResponse([]));
      }

      if (url.includes('/rest/agile/1.0/board/42/project')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const detail = await getBoardDetail(
      createJiraClient('https://jira.example.internal', 'pat-123'),
      42,
    );

    expect(detail.statuses).toEqual([
      { id: '10', name: 'Done' },
      { id: '20', name: 'In Progress' },
    ]);
    expect(detail.completionStatuses).toEqual([
      { id: '30', name: 'Closed' },
      { id: '10', name: 'Done' },
      { id: '20', name: 'In Progress' },
    ]);
  });
});
