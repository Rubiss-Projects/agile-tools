import { createHash } from 'node:crypto';
import { metricsClock, recordJiraRequest, recordJiraThrottle, recordJiraRateState, JiraRateLimiter, createMemoryJiraRateStore, type JiraRateState } from '@agile-tools/shared';

const connectionLimiters = new Map<string, JiraRateLimiter>();
const RETRY_ATTEMPTS = 3;

export type JiraChangelogFetchStrategy = 'subresource' | 'issue_expand';

export type JiraAuthStrategy =
  | {
      type: 'data_center_pat';
      baseUrl: string;
      patSecretRef: string;
    }
  | {
      type: 'cloud_oauth_3lo';
      cloudId: string;
      siteUrl: string;
      accessTokenSecretRef: string;
      refreshTokenSecretRef: string;
      accessTokenExpiresAt: Date;
      scopes: string[];
    };

export interface JiraClientOptions {
  rateLimiter?: JiraRateLimiter;
  connectionId?: string;
  scopeId?: string;
  syncRunId?: string;
  retryBudgetMs?: number;
  onProgress?: () => Promise<void>;
  changelogFetchStrategy?: JiraChangelogFetchStrategy | null;
  onChangelogFetchStrategyDetected?: (strategy: JiraChangelogFetchStrategy) => void | Promise<void>;
}

export class JiraClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'JiraClientError';
  }
}

export interface JiraServerInfo {
  version: string;
  /** 'Server' or 'Cloud' */
  deploymentType: string;
  baseUrl: string;
}

export interface FetchOptions {
  params?: Record<string, string | number | boolean>;
}

export interface PostOptions extends FetchOptions {
  body?: unknown;
}

function jiraOperation(path: string): string {
  if (path === '/rest/api/2/myself') return 'myself';
  if (path === '/rest/api/2/serverInfo') return 'server_info';
  if (path === '/rest/agile/1.0/board') return 'board_list';
  if (/^\/rest\/agile\/1\.0\/board\/[^/]+\/issue$/.test(path)) return 'board_issues';
  if (/^\/rest\/agile\/1\.0\/board\/[^/]+\/configuration$/.test(path)) return 'board_configuration';
  if (/^\/rest\/api\/2\/issue\/[^/]+\/changelog$/.test(path)) return 'issue_changelog';
  if (/^\/rest\/api\/2\/issue\/[^/]+$/.test(path)) return 'issue_detail';
  if (path === '/rest/api/2/search') return 'jql_search';
  if (path === '/rest/api/3/search/jql') return 'jql_search';
  if (path === '/rest/api/3/search/approximate-count') return 'jql_count';
  if (path === '/rest/api/2/status') return 'status_list';
  return 'other';
}

export class JiraClient {
  private readonly limiter: JiraRateLimiter;
  readonly stats = { requests: 0, rateLimited: 0, pausedMs: 0, issuesFetched: 0, issuesSkipped: 0 };
  lastRateState: JiraRateState | undefined;
  private changelogFetchStrategy: JiraChangelogFetchStrategy | undefined;
  private changelogStrategyProbe: Promise<JiraChangelogFetchStrategy> | undefined;
  readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly pat: string,
    private readonly options: JiraClientOptions = {},
  ) {
    // Normalize base URL: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.changelogFetchStrategy = options.changelogFetchStrategy ?? undefined;
    const key = options.connectionId ?? createHash('sha256').update(this.baseUrl).update(pat).digest('hex');
    this.limiter = options.rateLimiter ?? connectionLimiters.get(key) ?? new JiraRateLimiter(createMemoryJiraRateStore());
    if (!options.rateLimiter) connectionLimiters.set(key, this.limiter);
  }

  getChangelogFetchStrategy(): JiraChangelogFetchStrategy | undefined {
    return this.changelogFetchStrategy;
  }

  setChangelogFetchStrategy(strategy: JiraChangelogFetchStrategy): void {
    if (this.changelogFetchStrategy === strategy) {
      return;
    }

    this.changelogFetchStrategy = strategy;
    try {
      const detected = this.options.onChangelogFetchStrategyDetected?.(strategy);
      if (detected && typeof detected === 'object' && 'catch' in detected) {
        void detected.catch(() => undefined);
      }
    } catch {
      // Changelog strategy persistence is an optimization; detection should not fail sync.
    }
  }

  async detectChangelogFetchStrategy(
    probe: () => Promise<JiraChangelogFetchStrategy>,
  ): Promise<JiraChangelogFetchStrategy> {
    if (this.changelogFetchStrategy) {
      return this.changelogFetchStrategy;
    }

    this.changelogStrategyProbe ??= probe()
      .then((strategy) => {
        this.setChangelogFetchStrategy(strategy);
        return strategy;
      })
      .finally(() => {
        this.changelogStrategyProbe = undefined;
      });

    return this.changelogStrategyProbe;
  }

  async get<T>(path: string, options: FetchOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, options: PostOptions = {}): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, options: PostOptions = {}): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(normalizedPath, this.baseUrl + '/');
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const startedAt = Date.now();
    let rateLimited = false;
    let transientFailures = 0;
    const budget = this.options.retryBudgetMs ?? 120_000;
    const checkBudget = () => {
      if (rateLimited && Date.now() - startedAt >= budget) {
        throw new JiraClientError('Jira rate-limit retry budget exhausted; resume this sync later.', 429, 'RATE_LIMITED');
      }
    };
    for (let attempt = 0; ; attempt++) {
      checkBudget();
      await this.options.onProgress?.();
      const release = await this.limiter.acquire(async (milliseconds) => {
        checkBudget();
        await this.options.onProgress?.();
        this.stats.pausedMs += milliseconds;
        recordJiraThrottle(this.options.connectionId ?? 'unassigned', milliseconds / 1000);
      });
      const requestStartedAt = metricsClock.now();
      let response: Response | undefined;
      let requestSent = false;
      try {
        checkBudget();
        await this.options.onProgress?.();
        this.stats.requests++;
        requestSent = true;
        response = await fetch(url.toString(), {
          method,
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${this.pat}`,
            Accept: 'application/json',
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
        });
        this.lastRateState = await this.limiter.observe(response.headers, response.status, attempt);
        if (this.options.connectionId && this.lastRateState.observedRemaining !== null) {
          recordJiraRateState(this.options.connectionId, this.lastRateState.limit, this.lastRateState.observedRemaining);
        }
        if (response.status === 429) {
          rateLimited = true;
          this.stats.rateLimited++;
          await response.body?.cancel();
          continue;
        }
        if (!response.ok) {
          const body = (await response.text()).slice(0, 200);
          throw new JiraClientError(`Jira API error ${response.status}: ${body}`, response.status,
            response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : 'http_error');
        }
        return await response.json() as T;
      } catch (error) {
        // Lease/heartbeat failures must stop this attempt, not become HTTP retries.
        if (!requestSent) throw error;
        if (error instanceof JiraClientError && error.statusCode < 500) throw error;
        if (++transientFailures > RETRY_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (transientFailures - 1)));
      } finally {
        if (requestSent) recordJiraRequest({
          method, url, operation: jiraOperation(path),
          result: response ? response.ok ? 'success' : response.status === 429 ? 'rate_limited' : 'error' : 'network_error',
          ...(response ? { statusCode: response.status } : {}),
          ...(this.options.connectionId ? { connectionId: this.options.connectionId } : {}),
          ...(this.options.scopeId ? { scopeId: this.options.scopeId } : {}),
          durationSeconds: metricsClock.durationSecondsSince(requestStartedAt),
        });
        await release();
      }
    }
  }

  async fetchServerInfo(): Promise<JiraServerInfo> {
    const serverInfo = await this.get<{ version: string; deploymentType?: string; baseUrl: string }>(
      '/rest/api/2/serverInfo',
    );

    return {
      version: serverInfo.version,
      deploymentType: serverInfo.deploymentType ?? 'Server',
      baseUrl: serverInfo.baseUrl,
    };
  }

  /**
   * Validate the PAT by checking Jira identity and Agile board access.
   * Returns server info on success; throws JiraClientError on failure.
   */
  async validateConnection(): Promise<JiraServerInfo> {
    // Verify identity
    const myself = await this.get<{ accountId?: string; name?: string }>('/rest/api/2/myself');
    if (!myself.accountId && !myself.name) {
      throw new JiraClientError('PAT authentication did not return a user identity', 401, 'unauthorized');
    }

    // Verify Agile board access (needed for board discovery and sync)
    await this.get('/rest/agile/1.0/board', { params: { type: 'kanban', maxResults: 1 } });

    return this.fetchServerInfo();
  }
}

export function createJiraClient(
  baseUrl: string,
  pat: string,
  options: JiraClientOptions = {},
): JiraClient {
  return new JiraClient(baseUrl, pat, options);
}

export function inferChangelogFetchStrategyFromServerInfo(
  info: Pick<JiraServerInfo, 'version' | 'deploymentType'>,
): JiraChangelogFetchStrategy | undefined {
  if (info.deploymentType.toLowerCase() === 'cloud') {
    return 'subresource';
  }

  const [majorRaw, minorRaw] = info.version.split('.');
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    return undefined;
  }

  if (major < 8 || (major === 8 && minor < 3)) {
    return 'issue_expand';
  }

  return 'subresource';
}

export function normalizeChangelogFetchStrategy(
  value: string | null | undefined,
): JiraChangelogFetchStrategy | undefined {
  return value === 'subresource' || value === 'issue_expand' ? value : undefined;
}
