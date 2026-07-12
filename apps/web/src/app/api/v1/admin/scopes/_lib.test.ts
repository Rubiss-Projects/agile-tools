import { describe, expect, it } from 'vitest';

import { buildIncludedIssueTypes, formatIssueDetails, hasNamesForAllIds, mapSyncRun, selectNamedValues } from './_lib';

function syncRun(overrides: Partial<Parameters<typeof mapSyncRun>[0]> = {}): Parameters<typeof mapSyncRun>[0] {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scopeId: '22222222-2222-4222-8222-222222222222',
    trigger: 'manual',
    status: 'queued',
    requestedBy: null,
    startedAt: null,
    finishedAt: null,
    dataVersion: null,
    errorCode: null,
    errorSummary: null,
    createdAt: new Date('2026-07-11T20:00:00.000Z'),
    updatedAt: new Date('2026-07-11T20:05:00.000Z'),
    ...overrides,
  };
}

describe('mapSyncRun', () => {
  it('maps the status transition time from the field associated with each status', () => {
    const startedAt = new Date('2026-07-11T20:01:00.000Z');
    const finishedAt = new Date('2026-07-11T20:02:00.000Z');

    expect(mapSyncRun(syncRun()).statusChangedAt).toBe('2026-07-11T20:00:00.000Z');
    expect(mapSyncRun(syncRun({ status: 'running', startedAt })).statusChangedAt).toBe(startedAt.toISOString());
    expect(mapSyncRun(syncRun({ status: 'failed', finishedAt })).statusChangedAt).toBe(finishedAt.toISOString());
  });
});

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

describe('buildIncludedIssueTypes', () => {
  it('zips stored ids and names into named values when lengths match', () => {
    expect(buildIncludedIssueTypes(['story', 'bug'], ['Story', 'Bug'])).toEqual([
      { id: 'story', name: 'Story' },
      { id: 'bug', name: 'Bug' },
    ]);
  });

  it('returns undefined when stored names are missing or incomplete', () => {
    expect(buildIncludedIssueTypes(['story'], [])).toBeUndefined();
    expect(buildIncludedIssueTypes(['story', 'bug'], ['Story'])).toBeUndefined();
  });
});

describe('selectNamedValues', () => {
  it('preserves selected id order and falls back to the id when a name is unavailable', () => {
    expect(
      selectNamedValues(
        ['bug', 'story', 'task'],
        [
          { id: 'story', name: 'Story' },
          { id: 'bug', name: 'Bug' },
        ],
      ),
    ).toEqual([
      { id: 'bug', name: 'Bug' },
      { id: 'story', name: 'Story' },
      { id: 'task', name: 'task' },
    ]);
  });
});

describe('hasNamesForAllIds', () => {
  it('reports whether every selected id has a matching named value', () => {
    const available = [
      { id: 'story', name: 'Story' },
      { id: 'bug', name: 'Bug' },
    ];

    expect(hasNamesForAllIds(['story'], available)).toBe(true);
    expect(hasNamesForAllIds(['story', 'task'], available)).toBe(false);
    expect(hasNamesForAllIds(['story'], undefined)).toBe(false);
  });

  it('treats placeholder names that equal the raw id as unresolved', () => {
    expect(
      hasNamesForAllIds(['story'], [{ id: 'story', name: 'story' }]),
    ).toBe(false);
  });
});
