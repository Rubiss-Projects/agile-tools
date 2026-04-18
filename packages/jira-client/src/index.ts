export { JiraClient, JiraClientError, createJiraClient } from './client.js';
export type { JiraServerInfo, FetchOptions } from './client.js';

export { listBoards, getBoardDetail } from './discovery.js';

export { fetchBoardIssues, streamBoardIssues, fetchIssueChangelog } from './issues.js';
export type {
  RawJiraIssue,
  RawJiraIssueFields,
  ChangelogHistory,
  ChangelogItem,
  FetchBoardIssuesOptions,
  FetchBoardIssuesResult,
} from './issues.js';
