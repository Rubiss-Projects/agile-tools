// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HoldDefinitionForm } from './hold-definition-form';

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
});

describe('HoldDefinitionForm', () => {
  it('loads the current hold definition when expanded', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          scopeId: '11111111-1111-4111-8111-111111111111',
          holdStatusIds: ['20'],
          effectiveFrom: new Date('2026-04-19T12:00:00Z').toISOString(),
        }),
      ),
    );

    render(
      <HoldDefinitionForm
        scopeId="11111111-1111-4111-8111-111111111111"
        availableStatuses={[
          { id: '10', name: 'In Progress' },
          { id: '20', name: 'Blocked' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /hold definition/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /blocked/i })).toBeChecked();
    });
  });

  it('prevents saving when no hold status is selected', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    render(
      <HoldDefinitionForm
        scopeId="11111111-1111-4111-8111-111111111111"
        availableStatuses={[{ id: '20', name: 'Blocked' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /hold definition/i }));
    await user.click(await screen.findByRole('button', { name: /save hold definition/i }));

    expect(screen.getByText(/select at least one hold status/i)).toBeVisible();
  });

  it('saves the selected hold statuses', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          scopeId: '11111111-1111-4111-8111-111111111111',
          holdStatusIds: ['20'],
          effectiveFrom: new Date('2026-04-19T12:00:00Z').toISOString(),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <HoldDefinitionForm
        scopeId="11111111-1111-4111-8111-111111111111"
        availableStatuses={[
          { id: '10', name: 'In Progress' },
          { id: '20', name: 'Blocked' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /hold definition/i }));
    await user.click(screen.getByRole('checkbox', { name: /blocked/i }));
    await user.click(screen.getByRole('button', { name: /save hold definition/i }));

    expect(await screen.findByText(/hold definition saved/i)).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/scopes/11111111-1111-4111-8111-111111111111/hold-definition',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});