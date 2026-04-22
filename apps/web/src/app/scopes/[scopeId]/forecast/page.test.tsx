// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useParamsMock } = vi.hoisted(() => ({
  useParamsMock: vi.fn(() => ({ scopeId: 'scope-1' })),
}));

vi.mock('next/navigation', () => ({
  useParams: useParamsMock,
}));

import ForecastPage from './page';

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
  useParamsMock.mockReturnValue({ scopeId: 'scope-1' });
});

describe('ForecastPage', () => {
  it('shows the server throughput message instead of a generic HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'INVALID_SCOPE_TIMEZONE',
            message:
              'This scope uses an unsupported timezone identifier ("ETC"). Update the scope timezone to a valid value such as UTC or America/New_York.',
          },
          { status: 409 },
        ),
      ),
    );

    render(<ForecastPage />);

    expect(
      await screen.findByText(/unsupported timezone identifier \("ETC"\)/i),
    ).toBeVisible();
    expect(screen.queryByText(/failed to load throughput \(HTTP 409\)/i)).not.toBeInTheDocument();
  });
});