// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SyncCompletionRefresh, TriggerSyncButton } from './trigger-sync-button';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  refreshMock.mockClear();
});

describe('TriggerSyncButton', () => {
  it('refreshes the page when the triggered sync run finishes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: '11111111-1111-4111-8111-111111111111',
        scopeId: '22222222-2222-4222-8222-222222222222',
        trigger: 'manual',
        status: 'queued',
      }, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({
        id: '11111111-1111-4111-8111-111111111111',
        scopeId: '22222222-2222-4222-8222-222222222222',
        trigger: 'manual',
        status: 'succeeded',
        finishedAt: '2026-06-08T12:00:00.000Z',
        dataVersion: '11111111-1111-4111-8111-111111111111',
      }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TriggerSyncButton scopeId="22222222-2222-4222-8222-222222222222" />);

    fireEvent.click(screen.getByRole('button', { name: /trigger manual sync/i }));

    expect(await screen.findByText(/sync succeeded\. page data updated\./i)).toBeVisible();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/scopes/22222222-2222-4222-8222-222222222222/syncs',
      { method: 'POST' },
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/syncs/11111111-1111-4111-8111-111111111111');
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it('watches an already-active sync and refreshes when it finishes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: '33333333-3333-4333-8333-333333333333',
        scopeId: '22222222-2222-4222-8222-222222222222',
        trigger: 'scheduled',
        status: 'failed',
        finishedAt: '2026-06-08T12:00:00.000Z',
        errorSummary: 'Jira returned a transient error.',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<SyncCompletionRefresh syncRunId="33333333-3333-4333-8333-333333333333" />);

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/syncs/33333333-3333-4333-8333-333333333333');
  });
});
