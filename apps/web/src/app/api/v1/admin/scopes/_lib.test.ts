import { describe, expect, it } from 'vitest';

import { formatIssueDetails } from './_lib';

describe('formatIssueDetails', () => {
  it('formats nested issues with their dotted path', () => {
    expect(
      formatIssueDetails([
        {
          code: 'custom',
          path: ['timezone'],
          message: 'Must be a valid time zone identifier.',
        },
      ]),
    ).toEqual(['timezone: Must be a valid time zone identifier.']);
  });

  it('formats root-level issues without a leading colon', () => {
    expect(
      formatIssueDetails([
        {
          code: 'invalid_type',
          expected: 'object',
          path: [],
          message: 'Invalid input: expected object, received null',
        },
      ]),
    ).toEqual(['Invalid input: expected object, received null']);
  });
});
