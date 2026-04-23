import { describe, expect, it } from 'vitest';

import { formatScopeIssueTypes } from './page';

describe('formatScopeIssueTypes', () => {
  it('prefers persisted configured issue type names when available', () => {
    expect(
      formatScopeIssueTypes({
        includedIssueTypeIds: ['story', 'bug'],
        includedIssueTypes: [
          { id: 'story', name: 'Story' },
          { id: 'bug', name: 'Bug' },
        ],
      }),
    ).toBe('Story, Bug');
  });

  it('falls back to filter option names for older rows without persisted names', () => {
    expect(
      formatScopeIssueTypes(
        {
          includedIssueTypeIds: ['story', 'bug'],
        },
        {
          issueTypes: [
            { id: 'story', name: 'Story' },
            { id: 'bug', name: 'Bug' },
          ],
        },
      ),
    ).toBe('Story, Bug');
  });

  it('prefers filter option names over persisted placeholder ids for legacy rows', () => {
    expect(
      formatScopeIssueTypes(
        {
          includedIssueTypeIds: ['story', 'bug'],
          includedIssueTypes: [
            { id: 'story', name: 'story' },
            { id: 'bug', name: 'Bug' },
          ],
        },
        {
          issueTypes: [
            { id: 'story', name: 'Story' },
            { id: 'bug', name: 'Bug' },
          ],
        },
      ),
    ).toBe('Story, Bug');
  });

  it('falls back to raw ids when no names are available', () => {
    expect(
      formatScopeIssueTypes({
        includedIssueTypeIds: ['story', 'bug'],
      }),
    ).toBe('story, bug');
  });
});
