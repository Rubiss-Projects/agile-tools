// @vitest-environment jsdom

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshSpy } = vi.hoisted(() => ({ refreshSpy: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}));

import { FlowScopeForm } from './flow-scope-form';

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
  refreshSpy.mockReset();
});

describe('FlowScopeForm', () => {
  it('walks through discovery, inspection, and scope creation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ boards: [{ boardId: 42, boardName: 'Payments Board' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          boardId: 42,
          boardName: 'Payments Board',
          columns: [{ name: 'Doing', statusIds: ['10'] }],
          statuses: [
            { id: '10', name: 'In Progress' },
            { id: '30', name: 'Done' },
          ],
          issueTypes: [{ id: 'story', name: 'Story' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: '11111111-1111-4111-8111-111111111111',
            connectionId: '22222222-2222-4222-8222-222222222222',
            boardId: 42,
            boardName: 'Payments Board',
            timezone: 'UTC',
            includedIssueTypeIds: ['story'],
            startStatusIds: ['10'],
            doneStatusIds: ['30'],
            syncIntervalMinutes: 5,
            status: 'active',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FlowScopeForm
        connections={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            baseUrl: 'https://jira.example.internal',
            displayName: 'Team Jira',
            healthStatus: 'healthy',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add flow scope/i }));
    await user.click(screen.getByRole('button', { name: /discover boards/i }));
    await screen.findByRole('option', { name: /payments board/i });

    await user.click(screen.getByRole('button', { name: /inspect board/i }));
    await screen.findByText(/start statuses/i);

    const startFieldset = screen.getByText(/start statuses/i).closest('fieldset');
    const doneFieldset = screen.getByText(/done statuses/i).closest('fieldset');
    const issueTypeFieldset = screen.getByText(/types to include in flow tracking/i).closest('fieldset');

    expect(startFieldset).not.toBeNull();
    expect(doneFieldset).not.toBeNull();
    expect(issueTypeFieldset).not.toBeNull();

    await user.click(within(startFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /in progress/i }));
    await user.click(within(doneFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /done/i }));
    await user.click(within(issueTypeFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /story/i }));
    await user.click(screen.getByRole('button', { name: /create flow scope/i }));

    expect(await screen.findByText(/flow scope created/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /view scope/i })).toHaveAttribute(
      'href',
      '/scopes/11111111-1111-4111-8111-111111111111',
    );
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});