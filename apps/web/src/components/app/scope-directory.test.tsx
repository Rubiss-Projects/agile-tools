// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScopeDirectory, type HomeScopeSummary } from './scope-directory';

const scopes: HomeScopeSummary[] = [
  {
    id: 'scope-alpha',
    boardId: '101',
    boardName: 'Alpha Delivery',
    timezone: 'America/New_York',
    includedIssueTypeNames: ['Story'],
    syncIntervalMinutes: 15,
    status: 'active',
    jiraDashboardUrl: 'https://jira.example.test/secure/RapidBoard.jspa?rapidView=101',
  },
  {
    id: 'scope-beta',
    boardId: '202',
    boardName: 'Beta Platform',
    timezone: 'America/Chicago',
    includedIssueTypeNames: ['Bug'],
    syncIntervalMinutes: 30,
    status: 'paused',
    jiraDashboardUrl: null,
  },
  {
    id: 'scope-gamma',
    boardId: '303',
    boardName: 'Gamma Enablement',
    timezone: 'UTC',
    includedIssueTypeNames: ['Story', 'Task'],
    syncIntervalMinutes: 60,
    status: 'needs_attention',
    jiraDashboardUrl: null,
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScopeDirectory', () => {
  it('filters scopes by search text and status', async () => {
    const user = userEvent.setup();
    render(<ScopeDirectory workspaceId="workspace-1" scopes={scopes} />);

    await user.type(screen.getByRole('searchbox', { name: /search scopes/i }), 'platform');

    expect(screen.getByText('Beta Platform')).toBeVisible();
    expect(screen.queryByText('Alpha Delivery')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Enablement')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: /search scopes/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: /filter scopes by status/i }), 'needs_attention');

    expect(screen.getByText('Gamma Enablement')).toBeVisible();
    expect(screen.queryByText('Alpha Delivery')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Platform')).not.toBeInTheDocument();
  });

  it('stores favorites in localStorage and places favorites first', async () => {
    const user = userEvent.setup();
    render(<ScopeDirectory workspaceId="workspace-1" scopes={scopes} />);

    await user.click(screen.getByRole('button', { name: /add beta platform to favorites/i }));

    expect(JSON.parse(window.localStorage.getItem('agile-tools:favorite-scopes:workspace-1') ?? '[]')).toEqual([
      'scope-beta',
    ]);

    await waitFor(() => {
      const rows = screen.getAllByRole('listitem');
      expect(within(rows[0] as HTMLElement).getByText('Beta Platform')).toBeVisible();
    });

    await user.click(screen.getByRole('checkbox', { name: /show favorite scopes only/i }));

    expect(screen.getByText('Beta Platform')).toBeVisible();
    expect(screen.queryByText('Alpha Delivery')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Enablement')).not.toBeInTheDocument();
  });

  it('loads stored favorites for the current workspace only', async () => {
    window.localStorage.setItem('agile-tools:favorite-scopes:workspace-1', JSON.stringify(['scope-gamma']));
    window.localStorage.setItem('agile-tools:favorite-scopes:workspace-2', JSON.stringify(['scope-alpha']));

    render(<ScopeDirectory workspaceId="workspace-1" scopes={scopes} />);

    await waitFor(() => {
      const rows = screen.getAllByRole('listitem');
      expect(within(rows[0] as HTMLElement).getByText('Gamma Enablement')).toBeVisible();
    });
  });

  it('keeps favorites usable when localStorage writes fail', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota exceeded.', 'QuotaExceededError');
    });

    render(<ScopeDirectory workspaceId="workspace-1" scopes={scopes} />);

    await user.click(screen.getByRole('button', { name: /add beta platform to favorites/i }));

    expect(setItemSpy).toHaveBeenCalled();
    await waitFor(() => {
      const rows = screen.getAllByRole('listitem');
      expect(within(rows[0] as HTMLElement).getByText('Beta Platform')).toBeVisible();
    });
  });
});
