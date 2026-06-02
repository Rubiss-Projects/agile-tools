import { describe, expect, it } from 'vitest';
import {
  EpicForecastTargetSchema,
  UpsertEpicForecastTargetRequestSchema,
} from './epic-forecast.js';

describe('epic forecast contracts', () => {
  it('allows zero manual story counts when no stories remain', () => {
    expect(() =>
      EpicForecastTargetSchema.parse({
        id: '00000000-0000-4000-8000-000000006001',
        scopeId: '00000000-0000-4000-8000-000000000003',
        jiraIssueKey: 'AG-EPIC-1',
        summary: 'Checkout reliability hardening',
        directUrl: 'https://jira.local.example/browse/AG-EPIC-1',
        dueDate: '2026-06-20',
        remainingStoryCount: 0,
        storyCountSource: 'manual',
        epicLinkStoryCount: null,
        jiraStoryCount: null,
        manualStoryCount: 0,
        status: 'active',
        closedAt: null,
        sortOrder: 1,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      }),
    ).not.toThrow();

    expect(() =>
      UpsertEpicForecastTargetRequestSchema.parse({
        jiraIssueKey: 'AG-EPIC-1',
        summary: 'Checkout reliability hardening',
        dueDate: '2026-06-20',
        remainingStoryCount: 0,
        storyCountSource: 'manual',
        manualStoryCount: 0,
      }),
    ).not.toThrow();
  });
});
