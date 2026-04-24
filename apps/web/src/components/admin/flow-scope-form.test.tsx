// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

function emptyResponse(init: ResponseInit = {}): Response {
  return new Response(null, init);
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
          columns: [{ name: 'Doing', statusIds: ['10', '30', '20'] }],
          statuses: [
            { id: '10', name: 'In Progress' },
            { id: '30', name: 'Backlog' },
            { id: '20', name: 'Done' },
          ],
          completionStatuses: [
            { id: '40', name: 'Closed' },
            { id: '10', name: 'In Progress' },
            { id: '20', name: 'Done' },
            { id: '30', name: 'Backlog' },
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
            doneStatusIds: ['40'],
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
    expect(within(doneFieldset as HTMLFieldSetElement).getByText(/closed \(off-board\)/i)).toBeVisible();
    expect(
      within(startFieldset as HTMLFieldSetElement)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Backlog', 'Done', 'In Progress']);
    expect(
      within(doneFieldset as HTMLFieldSetElement)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Backlog', 'Closed (off-board)', 'Done', 'In Progress']);

    await user.click(within(startFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /in progress/i }));
    await user.click(within(doneFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /closed \(off-board\)/i }));
    await user.click(within(issueTypeFieldset as HTMLFieldSetElement).getByRole('checkbox', { name: /story/i }));
    await user.click(screen.getByRole('button', { name: /create flow scope/i }));

    expect(await screen.findByText(/flow scope created/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /view scope/i })).toHaveAttribute(
      'href',
      '/scopes/11111111-1111-4111-8111-111111111111',
    );
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
  it('loads the existing scope configuration and saves edits', async () => {
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
          statuses: [{ id: '10', name: 'In Progress' }],
          completionStatuses: [
            { id: '10', name: 'In Progress' },
            { id: '40', name: 'Closed' },
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
            doneStatusIds: ['40'],
            syncIntervalMinutes: 15,
            status: 'active',
          },
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
        initialScope={{
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          boardId: 42,
          boardName: 'Payments Board',
          timezone: 'UTC',
          includedIssueTypeIds: ['story'],
          startStatusIds: ['10'],
          doneStatusIds: ['40'],
          syncIntervalMinutes: 10,
          status: 'active',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit flow scope/i }));
    await screen.findByText(/start statuses/i);

    const syncInterval = screen.getByRole('spinbutton', { name: /sync interval/i });
    await user.clear(syncInterval);
    await user.type(syncInterval, '15');
    await user.click(screen.getByRole('button', { name: /save flow scope/i }));

    expect(await screen.findByText(/flow scope updated/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/scopes/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('requires explicit confirmation before deleting a flow scope', async () => {
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
          statuses: [{ id: '10', name: 'In Progress' }],
          completionStatuses: [
            { id: '10', name: 'In Progress' },
            { id: '40', name: 'Closed' },
          ],
          issueTypes: [{ id: 'story', name: 'Story' }],
        }),
      )
      .mockResolvedValueOnce(emptyResponse({ status: 204 }));
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
        initialScope={{
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          boardId: 42,
          boardName: 'Payments Board',
          timezone: 'UTC',
          includedIssueTypeIds: ['story'],
          startStatusIds: ['10'],
          doneStatusIds: ['40'],
          syncIntervalMinutes: 10,
          status: 'active',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit flow scope/i }));
    await screen.findByText(/start statuses/i);

    await user.click(screen.getByRole('button', { name: /delete flow scope/i }));
    expect(
      screen.getByText(/permanently removes its sync history, board snapshots, work items, and derived analytics/i),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: /confirm delete flow scope/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/scopes/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the API error when deleting a flow scope is blocked', async () => {
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
          statuses: [{ id: '10', name: 'In Progress' }],
          completionStatuses: [
            { id: '10', name: 'In Progress' },
            { id: '40', name: 'Closed' },
          ],
          issueTypes: [{ id: 'story', name: 'Story' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { message: 'Wait for the active sync to finish before deleting this flow scope.' },
          { status: 409 },
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
        initialScope={{
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          boardId: 42,
          boardName: 'Payments Board',
          timezone: 'UTC',
          includedIssueTypeIds: ['story'],
          startStatusIds: ['10'],
          doneStatusIds: ['40'],
          syncIntervalMinutes: 10,
          status: 'active',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit flow scope/i }));
    await screen.findByText(/start statuses/i);

    await user.click(screen.getByRole('button', { name: /delete flow scope/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete flow scope/i }));

    expect(
      await screen.findByText(/wait for the active sync to finish before deleting this flow scope/i),
    ).toBeVisible();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('keeps same-board edit submission available when discovery fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ message: 'Discovery failed.' }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          boardId: 42,
          boardName: 'Payments Board',
          timezone: 'UTC',
          includedIssueTypeIds: ['story'],
          startStatusIds: ['10'],
          doneStatusIds: ['40'],
          syncIntervalMinutes: 12,
          status: 'active',
        }),
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
        initialScope={{
          id: '11111111-1111-4111-8111-111111111111',
          connectionId: '22222222-2222-4222-8222-222222222222',
          boardId: 42,
          boardName: 'Payments Board',
          timezone: 'UTC',
          includedIssueTypeIds: ['story'],
          startStatusIds: ['10'],
          doneStatusIds: ['40'],
          syncIntervalMinutes: 10,
          status: 'active',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit flow scope/i }));
    expect(await screen.findByText(/using the saved scope mapping because jira inspection is unavailable/i)).toBeVisible();

    const syncInterval = screen.getByRole('spinbutton', { name: /sync interval/i });
    await user.clear(syncInterval);
    await user.type(syncInterval, '12');
    await user.click(screen.getByRole('button', { name: /save flow scope/i }));

    expect(await screen.findByText(/flow scope updated/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/scopes/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('clears stale inspection when rediscovery switches to a different board', async () => {
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
          statuses: [{ id: '10', name: 'In Progress' }],
          completionStatuses: [{ id: '40', name: 'Done' }],
          issueTypes: [{ id: 'story', name: 'Story' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ boards: [{ boardId: 77, boardName: 'Platform Board' }] }),
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

    await user.click(screen.getByRole('button', { name: /discover boards/i }));
    await screen.findByRole('option', { name: /payments board/i });
    await user.click(screen.getByRole('button', { name: /inspect board/i }));
    await screen.findByText(/start statuses/i);

    await user.click(screen.getByRole('button', { name: /discover boards/i }));
    await screen.findByRole('option', { name: /platform board/i });

    expect(screen.queryByText(/start statuses/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create flow scope/i })).not.toBeInTheDocument();
  });
});
