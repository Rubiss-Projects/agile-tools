// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpicForecastPanel } from './epic-forecast-panel';

const scopeId = '00000000-0000-4000-8000-000000000003';
const targetId = '00000000-0000-4000-8000-000000006001';

const archivedResponse = {
  scopeId,
  dataVersion: 'run-1',
  sampleMode: 'rolling',
  historicalWindowDays: 90,
  sampleStartDate: '2026-03-03',
  sampleEndDate: '2026-06-01',
  sampleSize: 12,
  iterations: 10000,
  warnings: [],
  targets: [
    {
      id: targetId,
      scopeId,
      jiraIssueKey: 'AG-EPIC-1',
      summary: 'Checkout reliability hardening',
      directUrl: 'https://jira.local.example/browse/AG-EPIC-1',
      dueDate: '2026-06-20',
      remainingStoryCount: 4,
      storyCountSource: 'epic_link',
      epicLinkStoryCount: 4,
      jiraStoryCount: null,
      manualStoryCount: null,
      status: 'closed',
      closedAt: '2026-05-27T15:00:00.000Z',
      sortOrder: 3,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T11:00:00.000Z',
    },
  ],
  results: [],
};

describe('EpicForecastPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets archived epics be re-activated without changing their story metadata', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve(Response.json({ ...archivedResponse.targets[0], status: 'active', closedAt: null }));
      }
      return Promise.resolve(Response.json(archivedResponse));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <EpicForecastPanel
        scopeId={scopeId}
        sampleWindow={{ sampleMode: 'rolling', historicalWindowDays: 90 }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /re-activate ag-epic-1/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/scopes/${scopeId}/epic-forecasts/${targetId}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.any(String),
        }),
      );
    });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(patchCall?.[1]?.body as string)).toMatchObject({
      jiraIssueKey: 'AG-EPIC-1',
      storyCountSource: 'epic_link',
      epicLinkStoryCount: 4,
      status: 'active',
      closedAt: null,
      sortOrder: 3,
    });
  });

  it('lets archived epics be deleted', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(Response.json(archivedResponse));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <EpicForecastPanel
        scopeId={scopeId}
        sampleWindow={{ sampleMode: 'rolling', historicalWindowDays: 90 }}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: /delete ag-epic-1/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/scopes/${scopeId}/epic-forecasts/${targetId}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
