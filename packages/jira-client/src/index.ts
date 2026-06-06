export {
  JiraClient,
  JiraClientError,
  createJiraClient,
  inferChangelogFetchStrategyFromServerInfo,
  normalizeChangelogFetchStrategy,
} from './client.js';
export type {
  JiraChangelogFetchStrategy,
  JiraClientOptions,
  JiraServerInfo,
  FetchOptions,
  JiraAuthStrategy,
} from './client.js';

export { listBoards, getBoardDetail, getBoardDetailWithFilterId, getBoardFilterId } from './discovery.js';

export {
  fetchBoardIssues,
  streamBoardIssues,
  fetchIssueChangelog,
  fetchLatestIssueComment,
  streamJqlIssues,
  fetchJqlIssueCount,
} from './issues.js';
export type {
  JiraComment,
  RawJiraIssue,
  RawJiraIssueFields,
  ChangelogHistory,
  ChangelogItem,
  FetchBoardIssuesOptions,
  FetchBoardIssuesResult,
  StreamJqlIssuesOptions,
} from './issues.js';

export {
  exchangeAtlassianOAuthCode,
  fetchAtlassianAccessibleResources,
  refreshAtlassianOAuthToken,
} from './oauth.js';
export type {
  AtlassianAccessibleResource,
  AtlassianOAuthTokenResponse,
} from './oauth.js';
