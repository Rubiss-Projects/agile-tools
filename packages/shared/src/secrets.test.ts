import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, maskSecret, redactCredentials } from './secrets.js';

describe('encryptSecret and decryptSecret', () => {
  it('round-trips a plaintext secret with the same key', () => {
    const key = '12345678901234567890123456789012';

    const encrypted = encryptSecret('jira-pat-secret', key);
    const decrypted = decryptSecret(encrypted, key);

    expect(encrypted).not.toBe('jira-pat-secret');
    expect(decrypted).toBe('jira-pat-secret');
  });

  it('fails decryption when the wrong key is used', () => {
    const encrypted = encryptSecret('jira-pat-secret', '12345678901234567890123456789012');

    expect(() =>
      decryptSecret(encrypted, 'abcdefghijklmnopqrstuvwxyzABCDEF'),
    ).toThrow();
  });
});

describe('redactCredentials', () => {
  it('removes shallow credential fields and keeps other properties', () => {
    const result = redactCredentials({
      pat: 'secret-pat',
      token: 'secret-token',
      password: 'secret-password',
      secret: 'secret-value',
      displayName: 'Team Jira',
    });

    expect(result).toEqual({ displayName: 'Team Jira' });
  });
});

describe('maskSecret', () => {
  it('shows only the trailing characters', () => {
    expect(maskSecret('mysecrettoken1234')).toBe('****1234');
  });

  it('returns a fixed mask for empty values', () => {
    expect(maskSecret('')).toBe('****');
  });
});