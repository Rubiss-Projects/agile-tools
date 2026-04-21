// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshSpy } = vi.hoisted(() => ({ refreshSpy: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}));

import { JiraConnectionForm, ValidateConnectionButton } from './jira-connection-form';

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

describe('JiraConnectionForm', () => {
  it('creates a connection, clears the form, and refreshes the route', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: '11111111-1111-4111-8111-111111111111',
        baseUrl: 'https://jira.example.internal',
        displayName: 'Team Jira',
        healthStatus: 'draft',
      }, { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<JiraConnectionForm />);

    await user.type(screen.getByRole('textbox', { name: /jira base url/i }), 'https://jira.example.internal');
    await user.type(screen.getByLabelText(/personal access token/i), 'secret-pat');
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Team Jira');
    await user.click(screen.getByRole('button', { name: /create connection/i }));

    await screen.findByText(/connection created/i);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/jira-connections',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(screen.getByRole('textbox', { name: /jira base url/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /display name/i })).toHaveValue('');
    expect(screen.getByText(/team jira/i)).toBeVisible();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('shows an API error message when creation fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'PAT is invalid.' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<JiraConnectionForm />);

    await user.type(screen.getByRole('textbox', { name: /jira base url/i }), 'https://jira.example.internal');
    await user.type(screen.getByLabelText(/personal access token/i), 'bad-pat');
    await user.click(screen.getByRole('button', { name: /create connection/i }));

    expect(await screen.findByText(/pat is invalid/i)).toBeVisible();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('updates a connection without requiring PAT rotation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: '11111111-1111-4111-8111-111111111111',
        baseUrl: 'https://jira.example.internal',
        displayName: 'Renamed Jira',
        healthStatus: 'healthy',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JiraConnectionForm
        initialConnection={{
          id: '11111111-1111-4111-8111-111111111111',
          baseUrl: 'https://jira.example.internal',
          displayName: 'Team Jira',
          healthStatus: 'healthy',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit connection/i }));
    await user.clear(screen.getByRole('textbox', { name: /display name/i }));
    await user.type(screen.getByRole('textbox', { name: /display name/i }), 'Renamed Jira');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await screen.findByText(/connection updated/i);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/jira-connections/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"displayName":"Renamed Jira"');
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain('"pat"');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ValidateConnectionButton', () => {
  it('shows a healthy validation result and refreshes the route', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        connectionId: '11111111-1111-4111-8111-111111111111',
        healthStatus: 'healthy',
        validatedAt: new Date('2026-04-19T12:00:00Z').toISOString(),
        warnings: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ValidateConnectionButton connectionId="11111111-1111-4111-8111-111111111111" />);

    await user.click(screen.getByRole('button', { name: /validate connection/i }));

    expect(await screen.findByText(/connection is healthy/i)).toBeVisible();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('shows a network error when validation fails before a response is returned', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failed')));

    render(<ValidateConnectionButton connectionId="11111111-1111-4111-8111-111111111111" />);

    await user.click(screen.getByRole('button', { name: /validate connection/i }));

    expect(await screen.findByText(/network error during validation/i)).toBeVisible();
  });
});
