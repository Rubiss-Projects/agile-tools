import { z } from 'zod';
import type { PrismaClient } from '@agile-tools/db';
import { fetchIssueChangelog, fetchLatestIssueComment, type JiraClient, type RawJiraIssue } from '@agile-tools/jira-client';

const historiesSchema = z.array(z.object({
  id: z.string(), created: z.string(), items: z.array(z.object({
    field: z.string(), fieldId: z.string().optional(),
    from: z.string().nullable().optional(), to: z.string().nullable().optional(),
    fromString: z.string().nullable().optional(),
    // JSON objects inherit Object.prototype.toString when Jira omits this optional field.
    toString: z.preprocess((value) => value === Object.prototype.toString ? undefined : value, z.string().nullable().optional()),
  })),
}));
const commentSchema = z.object({
  id: z.string().optional(), body: z.string().optional(), created: z.string().optional(), updated: z.string().optional(),
  author: z.object({ displayName: z.string().optional(), name: z.string().optional(), accountId: z.string().optional() }).optional(),
}).nullable();

/** Cache only complete histories, keyed by connection and Jira's exact updated value. */
export async function loadIssueDetails(db: PrismaClient, client: JiraClient, connectionId: string, issue: RawJiraIssue, maxAgeMs: number) {
  const key = { connectionId, jiraIssueId: issue.id };
  const cached = await db.jiraIssueCache.findUnique({ where: { connectionId_jiraIssueId: key } });
  const histories = historiesSchema.safeParse(cached?.changelog);
  const comment = z.object({ value: commentSchema }).safeParse(cached?.latestComment);
  if (issue.fields.updated && cached?.jiraUpdatedAt === issue.fields.updated &&
      Date.now() - cached.fetchedAt.getTime() < maxAgeMs && histories.success && comment.success) {
    client.stats.issuesSkipped++;
    return { changelog: histories.data, latestComment: comment.data.value };
  }
  const inline = issue.changelog;
  const changelog = historiesSchema.parse(inline && inline.startAt === 0 && inline.total === inline.histories.length
    ? inline.histories : await fetchIssueChangelog(client, issue.id));
  const latestComment = commentSchema.parse(await fetchLatestIssueComment(client, issue.id, issue.fields.comment));
  client.stats.issuesFetched++;
  // A missing timestamp cannot establish that the next observation is unchanged.
  if (issue.fields.updated) {
    const data = { jiraUpdatedAt: issue.fields.updated, changelog, latestComment: { value: latestComment }, fetchedAt: new Date() };
    await db.jiraIssueCache.upsert({ where: { connectionId_jiraIssueId: key }, create: { ...key, ...data }, update: data });
  }
  return { changelog, latestComment };
}
