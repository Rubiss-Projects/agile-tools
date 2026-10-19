import { describe, expect, it, vi } from 'vitest';
import { createJiraClient, type RawJiraIssue } from '@agile-tools/jira-client';
import type { PrismaClient } from '@agile-tools/db';
import { loadIssueDetails } from './issue-cache.js';

const issue: RawJiraIssue = {
  id: '1', key: 'TEST-1', fields: {
    summary: 'Story', project: { id: '1', key: 'TEST' }, issuetype: { id: 'story', name: 'Story' },
    status: { id: '10', name: 'Doing' }, created: '2026-01-01', updated: '2026-10-18', comment: { total: 0, comments: [] },
  }, changelog: { startAt: 0, maxResults: 1, total: 1, histories: [{ id: 'history', created: '2026-01-02', items: [{ field: 'status', from: '5', to: '10', toString: undefined }] }] },
};

function fixture(updated = issue.fields.updated, ageMs = 0) {
  const db = { jiraIssueCache: {
    findUnique: vi.fn().mockResolvedValue({ jiraUpdatedAt: updated, fetchedAt: new Date(Date.now() - ageMs), changelog: issue.changelog!.histories, latestComment: { value: null } }),
    upsert: vi.fn().mockResolvedValue({}),
  } };
  const client = createJiraClient('https://fake.test', 'test', { changelogFetchStrategy: 'issue_expand' });
  const get = vi.spyOn(client, 'get').mockResolvedValue({ changelog: issue.changelog });
  return { db: db as unknown as PrismaClient, cache: db.jiraIssueCache, client, get };
}

describe('issue detail cache', () => {
  it('skips unchanged history and comment calls and preserves cached history', async () => {
    const { db, client, get } = fixture();
    const details = await loadIssueDetails(db, client, 'connection', issue, 86_400_000);
    expect(details.changelog).toEqual(issue.changelog!.histories);
    expect(details.latestComment).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(client.stats.issuesSkipped).toBe(1);
  });
  it.each(['changed', 'expired'])('refreshes %s details from a complete bulk expansion', async (reason) => {
    const { db, cache, client, get } = fixture(reason === 'changed' ? 'old' : issue.fields.updated, reason === 'expired' ? 90_000_000 : 0);
    await loadIssueDetails(db, client, 'connection', issue, 86_400_000);
    expect(get).not.toHaveBeenCalled();
    expect(cache.upsert).toHaveBeenCalledOnce();
    expect(client.stats.issuesFetched).toBe(1);
  });
  it('falls back for a truncated expansion and refuses to cache incomplete history', async () => {
    const { db, cache, client, get } = fixture('old');
    const truncated = { ...issue, changelog: { ...issue.changelog!, total: 2 } };
    await loadIssueDetails(db, client, 'connection', truncated, 86_400_000);
    expect(get).toHaveBeenCalledWith('/rest/api/2/issue/1', expect.anything());
    cache.upsert.mockClear();
    get.mockResolvedValue({ changelog: truncated.changelog });
    await expect(loadIssueDetails(db, client, 'connection', truncated, 86_400_000)).rejects.toMatchObject({ code: 'INCOMPLETE_CHANGELOG' });
    expect(cache.upsert).not.toHaveBeenCalled();
  });
});
