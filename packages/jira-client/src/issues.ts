import type { JiraClient } from './client.js';

// ─── Raw Jira API response shapes ────────────────────────────────────────────

export interface ChangelogItem {
  field: string;
  fieldId?: string;
  fromString?: string | null;
  toString?: string | null;
  /** Status/user ID of the "from" value */
  from?: string | null;
  /** Status/user ID of the "to" value */
  to?: string | null;
}

export interface ChangelogHistory {
  id: string;
  created: string;
  items: ChangelogItem[];
}

export interface RawJiraIssueFields {
  summary: string;
  issuetype: { id: string; name: string };
  project: { id: string; key: string };
  status: { id: string; name: string };
  /** ISO 8601 Jira creation timestamp */
  created: string;
  assignee?: { accountId?: string; name?: string } | null;
  [key: string]: unknown;
}

export interface RawJiraIssue {
  id: string;
  key: string;
  fields: RawJiraIssueFields;
  /**
   * Inline changelog when fetched with `expand=changelog`.
   * Treat as opportunistic/partial — use fetchIssueChangelog for the full history.
   */
  changelog?: {
    startAt: number;
    maxResults: number;
    total: number;
    histories: ChangelogHistory[];
  };
}

interface JiraIssueSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: RawJiraIssue[];
}

interface JiraChangelogPageResponse {
  startAt: number;
  maxResults: number;
  total: number;
  isLast?: boolean;
  values: ChangelogHistory[];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface FetchBoardIssuesOptions {
  /** Start offset for pagination (default 0). */
  startAt?: number;
  /** Page size — Jira default is 50, max 100. */
  maxResults?: number;
  /**
   * Expand inline changelog with the issues response.
   * **Opportunistic only**: the inline changelog may be truncated by Jira.
   * Always use `fetchIssueChangelog()` for complete lifecycle history.
   */
  expandChangelog?: boolean;
}

export interface FetchBoardIssuesResult {
  issues: RawJiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

/** Fetch one page of issues from a Jira board. */
export async function fetchBoardIssues(
  client: JiraClient,
  boardId: number,
  options: FetchBoardIssuesOptions = {},
): Promise<FetchBoardIssuesResult> {
  const { startAt = 0, maxResults = 50, expandChangelog = false } = options;
  const params: Record<string, string | number | boolean> = { startAt, maxResults };
  if (expandChangelog) params['expand'] = 'changelog';

  const result = await client.get<JiraIssueSearchResponse>(
    `/rest/agile/1.0/board/${boardId}/issue`,
    { params },
  );

  return {
    issues: result.issues,
    total: result.total,
    startAt: result.startAt,
    maxResults: result.maxResults,
  };
}

/**
 * Async generator that yields every issue on a board across all pages.
 * De-duplicates by issue ID to handle boards where live ordering can shift
 * between pages during a sync run.
 */
export async function* streamBoardIssues(
  client: JiraClient,
  boardId: number,
  options: Omit<FetchBoardIssuesOptions, 'startAt'> = {},
): AsyncGenerator<RawJiraIssue> {
  const pageSize = options.maxResults ?? 50;
  let startAt = 0;
  let total = Infinity;
  const seen = new Set<string>();

  while (startAt < total) {
    const page = await fetchBoardIssues(client, boardId, { ...options, startAt, maxResults: pageSize });
    total = page.total;

    let yielded = 0;
    for (const issue of page.issues) {
      if (!seen.has(issue.id)) {
        seen.add(issue.id);
        yield issue;
        yielded++;
      }
    }

    // Stop if the page was empty or shorter than requested (last page)
    if (page.issues.length === 0 || page.issues.length < pageSize) break;
    startAt += page.issues.length;
  }
}

/**
 * Fetch the complete changelog for a Jira issue, paginating through all entries.
 * This is the authoritative source for lifecycle history — prefer it over inline
 * changelog expansions which may be truncated.
 */
export async function fetchIssueChangelog(
  client: JiraClient,
  issueIdOrKey: string,
): Promise<ChangelogHistory[]> {
  const histories: ChangelogHistory[] = [];
  let startAt = 0;
  const maxResults = 100;

  for (;;) {
    const page = await client.get<JiraChangelogPageResponse>(
      `/rest/api/2/issue/${issueIdOrKey}/changelog`,
      { params: { startAt, maxResults } },
    );

    histories.push(...page.values);

    // Stop when Jira signals last page, or on a short/empty page
    if (page.isLast || page.values.length === 0 || page.values.length < maxResults) break;
    startAt += page.values.length;
  }

  return histories;
}
