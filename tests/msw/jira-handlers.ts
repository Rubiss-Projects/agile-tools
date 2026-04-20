import { http, HttpResponse } from 'msw';

const JIRA_BASE = 'https://jira.example.internal';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const boards = [
  { id: 1, name: 'Team Kanban', type: 'kanban', location: { projectKey: 'PROJ' } },
];

const boardConfig = {
  id: 1,
  name: 'Team Kanban',
  columnConfig: {
    columns: [
      { name: 'To Do', statuses: [{ id: '1', self: `${JIRA_BASE}/rest/api/2/status/1` }] },
      { name: 'In Progress', statuses: [{ id: '2', self: `${JIRA_BASE}/rest/api/2/status/2` }] },
      { name: 'Done', statuses: [{ id: '3', self: `${JIRA_BASE}/rest/api/2/status/3` }] },
    ],
  },
};

const issues = {
  issues: [
    {
      id: 'PROJ-1',
      key: 'PROJ-1',
      fields: {
        summary: 'Sample story',
        issuetype: { id: 'it-1', name: 'Story' },
        status: { id: '2', name: 'In Progress' },
        project: { id: 'proj-1', key: 'PROJ' },
        created: '2026-01-01T00:00:00.000Z',
      },
      changelog: {
        histories: [
          {
            id: 'cl-1',
            created: '2026-01-02T00:00:00.000Z',
            items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress', from: '1', to: '2' }],
          },
        ],
      },
    },
  ],
  total: 1,
  startAt: 0,
  maxResults: 50,
};

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const jiraHandlers = [
  // PAT validation — return the authenticated identity first
  http.get(`${JIRA_BASE}/rest/api/2/myself`, () =>
    HttpResponse.json({ accountId: 'test-user-account' }),
  ),

  // PAT validation — return server info
  http.get(`${JIRA_BASE}/rest/api/2/serverInfo`, () =>
    HttpResponse.json({ version: '8.14.0', baseUrl: JIRA_BASE }),
  ),

  // List boards
  http.get(`${JIRA_BASE}/rest/agile/1.0/board`, () =>
    HttpResponse.json({ values: boards, maxResults: 50, startAt: 0, isLast: true }),
  ),

  // Board config (columns, statuses)
  http.get(`${JIRA_BASE}/rest/agile/1.0/board/:boardId/configuration`, () =>
    HttpResponse.json(boardConfig),
  ),

  // Board projects (optional — returns empty, falls back to global issue types)
  http.get(`${JIRA_BASE}/rest/agile/1.0/board/:boardId/project`, () =>
    HttpResponse.json({ maxResults: 10, startAt: 0, total: 0, isLast: true, values: [] }),
  ),

  // All statuses (used by board detail discovery to label column statuses)
  http.get(`${JIRA_BASE}/rest/api/2/status`, () =>
    HttpResponse.json([
      { id: '1', name: 'To Do' },
      { id: '2', name: 'In Progress' },
      { id: '3', name: 'Done' },
    ]),
  ),

  // Issue types for a project
  http.get(`${JIRA_BASE}/rest/api/2/issuetype`, () =>
    HttpResponse.json([{ id: 'it-1', name: 'Story' }]),
  ),

  // Field metadata (for blocked-field discovery)
  http.get(`${JIRA_BASE}/rest/api/2/field`, () =>
    HttpResponse.json([{ id: 'customfield_10001', name: 'Story Points' }]),
  ),

  // Issues with changelog expansion
  http.get(`${JIRA_BASE}/rest/api/2/search`, () => HttpResponse.json(issues)),

  // Board backlog issues
  http.get(`${JIRA_BASE}/rest/agile/1.0/board/:boardId/issue`, () =>
    HttpResponse.json(issues),
  ),
];

/** Override for an unhealthy Jira instance (401). */
export const jiraUnauthorisedHandlers = [
  http.get(`${JIRA_BASE}/rest/api/2/myself`, () =>
    HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
  ),

  http.get(`${JIRA_BASE}/rest/api/2/serverInfo`, () =>
    HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
  ),
];
