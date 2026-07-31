import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildSessionRecoveryUrl,
  fetchWithSessionRecovery,
  OIDC_SESSION_RECOVERY,
  SESSION_RECOVERY_HEADER,
} from './session-recovery';

afterEach(() => vi.unstubAllGlobals());

describe('buildSessionRecoveryUrl', () => {
  it('preserves the complete current path through OIDC login', () => {
    expect(
      buildSessionRecoveryUrl('/scopes/scope-1/forecast?sampleMode=rolling#results'),
    ).toBe(
      '/api/oidc/login?next=%2Fscopes%2Fscope-1%2Fforecast%3FsampleMode%3Drolling%23results',
    );
  });

  it('navigates once after a recoverable 401 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 401,
          headers: { [SESSION_RECOVERY_HEADER]: OIDC_SESSION_RECOVERY },
        }),
      ),
    );
    const location = {
      pathname: '/scopes/scope-1/forecast',
      search: '?sampleMode=rolling',
      hash: '#results',
      assign: vi.fn(),
    };

    await fetchWithSessionRecovery('/api/v1/scopes/scope-1/throughput', undefined, location);

    expect(location.assign).toHaveBeenCalledOnce();
    expect(location.assign).toHaveBeenCalledWith(
      '/api/oidc/login?next=%2Fscopes%2Fscope-1%2Fforecast%3FsampleMode%3Drolling%23results',
    );
  });

  it.each([
    ['a 401 without recovery', new Response(null, { status: 401 })],
    [
      'a 401 with an unrecognized recovery value',
      new Response(null, {
        status: 401,
        headers: { [SESSION_RECOVERY_HEADER]: 'https://attacker.example/login' },
      }),
    ],
    ['a successful response', new Response(null, { status: 200 })],
  ])('does not navigate for %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const location = { pathname: '/', search: '', hash: '', assign: vi.fn() };

    await fetchWithSessionRecovery('/api/test', undefined, location);

    expect(location.assign).not.toHaveBeenCalled();
  });
});
