import type { JiraClient } from './client.js';
import type { BoardSummary, BoardDiscoveryDetail, BoardColumn, NamedValue } from '@agile-tools/shared/contracts/api';

// ─── Raw Jira API response shapes ────────────────────────────────────────────

interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectKey?: string;
  };
}

interface JiraBoardListResponse {
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: JiraBoard[];
}

interface JiraBoardConfigColumn {
  name: string;
  statuses: { id: string }[];
}

interface JiraBoardConfiguration {
  id: number;
  name: string;
  columnConfig: {
    columns: JiraBoardConfigColumn[];
  };
  filter?: { id: string };
}

interface JiraBoardProjectsResponse {
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: Array<{ id: number; key: string; name: string }>;
}

interface JiraStatus {
  id: string;
  name: string;
}

interface JiraIssueType {
  id: string;
  name: string;
}

interface JiraIssueTypeWithStatuses {
  id: string;
  name: string;
  statuses: JiraStatus[];
}

interface JiraField {
  id: string;
  name: string;
  schema?: { type: string; custom?: string };
}

interface BoardDetailData {
  config: JiraBoardConfiguration;
  allStatuses: JiraStatus[];
  allIssueTypes: JiraIssueType[];
  allFields: JiraField[];
  boardProjects: JiraBoardProjectsResponse | null;
}

const namedValueCollator = new Intl.Collator('en', {
  sensitivity: 'base',
});

function sortNamedValues(values: Iterable<NamedValue>): NamedValue[] {
  return Array.from(values).sort(
    (left, right) => namedValueCollator.compare(left.name, right.name) || left.id.localeCompare(right.id),
  );
}

async function fetchBoardDetailData(
  client: JiraClient,
  boardId: number,
): Promise<BoardDetailData> {
  const [config, allStatuses, allIssueTypes, allFields, boardProjects] = await Promise.all([
    client.get<JiraBoardConfiguration>(`/rest/agile/1.0/board/${boardId}/configuration`),
    client.get<JiraStatus[]>('/rest/api/2/status'),
    client.get<JiraIssueType[]>('/rest/api/2/issuetype'),
    client.get<JiraField[]>('/rest/api/2/field'),
    client
      .get<JiraBoardProjectsResponse>(`/rest/agile/1.0/board/${boardId}/project`, {
        params: { maxResults: 50 },
      })
      .catch(() => null),
  ]);

  return { config, allStatuses, allIssueTypes, allFields, boardProjects };
}

async function buildBoardDetail(
  client: JiraClient,
  boardId: number,
  data: BoardDetailData,
): Promise<BoardDiscoveryDetail> {
  const { config, allStatuses, allIssueTypes, allFields, boardProjects } = data;

  // Build column layout from board configuration.
  const columns: BoardColumn[] = config.columnConfig.columns.map((col) => ({
    name: col.name,
    statusIds: col.statuses.map((s) => s.id),
  }));

  // Filter statuses to those that appear in the board columns.
  const boardStatusIds = new Set(columns.flatMap((c) => c.statusIds));
  const statuses = sortNamedValues(
    allStatuses
      .filter((s) => boardStatusIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name })),
  );

  const boardAndFallbackStatusEntries = allStatuses.map((status) => [status.id, status.name] as const);
  let completionStatusesMap: Map<string, string>;

  // Narrow issue types and completion statuses to those active in the board's projects when possible.
  let issueTypes: NamedValue[] = allIssueTypes.map((t) => ({ id: t.id, name: t.name }));
  if (boardProjects?.values.length) {
    const projectStatusResults = await Promise.allSettled(
      boardProjects.values.map((project) =>
        client.get<JiraIssueTypeWithStatuses[]>(`/rest/api/2/project/${project.key}/statuses`),
      ),
    );

    const issueTypesMap = new Map<string, string>();
    const projectCompletionStatusesMap = new Map<string, string>();

    for (const result of projectStatusResults) {
      if (result.status !== 'fulfilled') continue;

      for (const issueType of result.value) {
        issueTypesMap.set(issueType.id, issueType.name);

        for (const status of issueType.statuses) {
          projectCompletionStatusesMap.set(status.id, status.name);
        }
      }
    }

    if (issueTypesMap.size > 0) {
      issueTypes = sortNamedValues(Array.from(issueTypesMap, ([id, name]) => ({ id, name })));
    }

    if (projectCompletionStatusesMap.size > 0) {
      completionStatusesMap = new Map<string, string>(statuses.map((status) => [status.id, status.name]));
      for (const [id, name] of projectCompletionStatusesMap) {
        completionStatusesMap.set(id, name);
      }
    } else {
      completionStatusesMap = new Map<string, string>(boardAndFallbackStatusEntries);
    }
  } else {
    completionStatusesMap = new Map<string, string>(boardAndFallbackStatusEntries);
  }

  // Candidate blocked/flagged fields: select list, checkbox, or radio fields whose name contains a hold-related keyword.
  const holdKeywords = ['blocked', 'flagged', 'impediment', 'on hold', 'on-hold'];
  const blockedFields: NamedValue[] = allFields
    .filter((f) => holdKeywords.some((kw) => f.name.toLowerCase().includes(kw)))
    .map((f) => ({ id: f.id, name: f.name }));

  return {
    boardId,
    boardName: config.name,
    columns,
    statuses,
    completionStatuses: sortNamedValues(
      Array.from(completionStatusesMap, ([id, name]) => ({ id, name })),
    ),
    issueTypes,
    blockedFields: blockedFields.length > 0 ? blockedFields : undefined,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * List all Kanban boards visible to the service account.
 * Paginates through the full result set.
 */
export async function listBoards(client: JiraClient): Promise<BoardSummary[]> {
  const boards: BoardSummary[] = [];
  let startAt = 0;
  const maxResults = 50;

  for (;;) {
    const page = await client.get<JiraBoardListResponse>('/rest/agile/1.0/board', {
      params: { type: 'kanban', startAt, maxResults },
    });

    for (const board of page.values) {
      boards.push({
        boardId: board.id,
        boardName: board.name,
        projectKeys: board.location?.projectKey ? [board.location.projectKey] : undefined,
      });
    }

    if (page.isLast || page.values.length === 0) break;
    startAt += page.values.length;
  }

  return boards;
}

/**
 * Return column layout, statuses, issue types, and candidate blocked fields for a board.
 * Fetches board configuration and supporting metadata in parallel where possible.
 */
export async function getBoardDetail(
  client: JiraClient,
  boardId: number,
): Promise<BoardDiscoveryDetail> {
  const data = await fetchBoardDetailData(client, boardId);
  return buildBoardDetail(client, boardId, data);
}

export async function getBoardDetailWithFilterId(
  client: JiraClient,
  boardId: number,
): Promise<{ detail: BoardDiscoveryDetail; filterId: string | null }> {
  const data = await fetchBoardDetailData(client, boardId);

  return {
    detail: await buildBoardDetail(client, boardId, data),
    filterId: data.config.filter?.id ?? null,
  };
}

/**
 * Return the saved-filter ID backing a board's JQL query.
 *
 * Returns null if the board configuration does not expose a filter (unexpected in practice).
 * This filter ID can be used in JQL via `filter = <id>` to scope searches to the same
 * issue set as the board without being constrained to column-mapped statuses.
 */
export async function getBoardFilterId(
  client: JiraClient,
  boardId: number,
): Promise<string | null> {
  const config = await client.get<{ filter?: { id: string } }>(
    `/rest/agile/1.0/board/${boardId}/configuration`,
  );
  return config.filter?.id ?? null;
}
