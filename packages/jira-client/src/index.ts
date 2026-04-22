export { JiraClient, JiraClientError, createJiraClient } from './client.js';
export type { JiraServerInfo, FetchOptions } from './client.js';

export { listBoards, getBoardDetail, getBoardDetailWithFilterId, getBoardFilterId } from './discovery.js';

export { fetchBoardIssues, streamBoardIssues, fetchIssueChangelog, streamJqlIssues } from './issues.js';
export type {
  RawJiraIssue,
  RawJiraIssueFields,
  ChangelogHistory,
  ChangelogItem,
  FetchBoardIssuesOptions,
  FetchBoardIssuesResult,
  StreamJqlIssuesOptions,
} from './issues.js';
