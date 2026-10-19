# Quickstart: Kanban Flow Forecasting

This quickstart describes the intended developer workflow once implementation begins. The repository is still in planning, so the commands below define the target setup and verification flow for the full feature once implementation is complete.

## Prerequisites

- Node.js 24 LTS
- pnpm 10+
- Docker or another local PostgreSQL runtime
- Access to a self-hosted Jira Data Center instance on version 8.14 or later
- A Jira service-account PAT with permission to read the target board, issues, and changelog history

## Planned Workspace Layout

```text
apps/web        # Next.js UI and HTTP API
apps/worker     # Scheduled sync, manual refresh jobs, projection rebuilds
packages/db     # Prisma schema and database helpers
packages/analytics
packages/jira-client
packages/shared
```

## Environment Variables

Create local environment files for the web and worker processes with at least the following variables:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agile_tools
ENCRYPTION_KEY=replace-with-local-dev-key
SESSION_SECRET=replace-with-local-dev-session-secret
DEFAULT_SYNC_INTERVAL_MINUTES=10
LOG_LEVEL=debug
```

Jira base URLs and PAT values are entered through the admin UI and stored as encrypted secrets or secret references rather than hard-coded in environment files.

If you are exercising the production image directly on `http://localhost`, also set:

```bash
ALLOW_LOOPBACK_HTTP_BYPASS=true
ALLOW_LOCAL_BOOTSTRAP=true
```

## Bootstrap

1. Install dependencies.

```bash
pnpm install
```

2. Start PostgreSQL.

```bash
docker compose up -d postgres
```

3. Apply the initial schema.

```bash
pnpm --filter @agile-tools/db prisma migrate dev
```

4. Start the web application.

```bash
pnpm --filter @agile-tools/web dev
```

5. Start the background worker.

```bash
pnpm --filter @agile-tools/worker dev
```

## Configure The First Jira Scope

1. Open the admin connection screen in the web app.
2. Create a Jira connection with the self-hosted base URL and service-account PAT.
3. Validate the connection and confirm the instance health is `healthy`.
4. Discover boards and choose the target kanban board.
5. Define the flow scope by selecting included issue types, explicit start and done statuses, and a valid time zone identifier such as `UTC` or `America/New_York`. Done statuses may include terminal workflow states that are not visible as board columns, such as `Closed`.
6. Trigger the first manual sync and wait for projection rebuild to finish.
7. If User Story 2 is implemented, configure the hold definition by mapping one or more hold statuses and, if needed, a blocked field.

## Update Existing Jira Configuration

1. Open **Admin → Jira Connections**.
2. Use **Edit Connection** to change the display name or base URL, or rotate the PAT. If the base URL or PAT changes, validate the connection again before relying on sync health.
3. Use **Edit Flow Scope** to change the connection, board, issue-type mapping, start/done statuses, timezone, or sync cadence. Timezones must remain valid identifiers such as `UTC` or `America/New_York`.
4. Boundary changes to the flow scope automatically queue a follow-up sync. If a sync is already queued or running, wait for it to finish before saving a boundary-changing edit.

## Validate The Primary User Journeys

If validating only the MVP slice, stop after the Connection And Sync journey. The remaining sections describe the full post-MVP validation flow.

### 1. Connection And Sync

- Confirm the scope shows the latest successful sync timestamp.
- Verify that the sync history records a successful manual refresh.
- Confirm that connection health remains `healthy` after validation and sync.
- During a subsequent manual or scheduled sync, refresh the flow view and confirm it continues to show the last successful data version until the new sync completes.

### 2. Scatter Plot For Aging And On-Hold Stories

- Open the flow view after the first sync completes.
- Confirm that active work items appear from local projections rather than live Jira data.
- Apply historical-window, workflow-status, issue-type, `aging only`, and `on hold only` filters.
- Open an item detail view and confirm age is shown in working days, alongside hold periods and lifecycle timeline values.

### 3. Story-Count Monte Carlo Forecasting

- Open the forecast workflow for the configured scope.
- Confirm the completed-story throughput view matches the historical window selected for the forecast, omits weekend buckets, and rolls weekend completions into the previous working day.
- Request a completion-date forecast using a remaining story count.
- Request a completion-volume forecast using a target date.
- Confirm that completion-date forecasts return date ranges, completion-volume forecasts return story-count ranges, and both include sample sizes, historical windows, and warnings when confidence is low.

## Automated Checks

Run the planned validation suite before merging implementation work:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contract
pnpm test:integration
pnpm test:e2e
pnpm test:perf
```

The contract and integration suites should include Jira API normalization, projection rebuild correctness, and sync concurrency scenarios. The end-to-end suite should cover the three primary user stories from the spec.

## Performance Acceptance Thresholds

Performance benchmarks run via `pnpm test:perf` (Vitest with Testcontainers Postgres).

| Path | p95 target |
|---|---|
| `queryCurrentWorkItems` (flow scatter-plot DB query) | < 500 ms |
| `getWorkItemWithDetail` (item detail DB query) | < 500 ms |
| `runWhenForecast` / `runHowManyForecast` (Monte Carlo simulation, 10k trials) | < 3 000 ms |
| `queryDailyThroughput` (throughput projection DB query) | < 500 ms |

These are query-level guardrails measured against a seeded dataset of 500 active work items with lifecycle and hold-period history. They do not include Next.js route handling or network latency.

Performance validation should confirm that the flow view and item detail read paths stay under the plan target of `p95 < 500 ms` and forecast responses stay under `3 s` on representative historical datasets.

## Jira rate limits and resumable syncs

Use a dedicated Jira service-account PAT. Jira Data Center limits are per account; a person's PAT shares their interactive quota. Reuse one connection for all boards using that account: separate connection records have separate app budgets.

Apply migrations before starting updated processes (`pnpm --filter @agile-tools/db exec prisma migrate deploy`). Roll out web and all workers together; old workers bypass the limiter. The migrations add tables/columns without rewriting existing data. The first sync warms the history cache; subsequent syncs benefit from unchanged-issue reuse.

Defaults allocate 50% of reported FillRate/Interval, reserve 20% of bucket capacity, and allow three concurrent HTTP calls per connection. Before headers are available, assume a 240-token bucket refilling at 120/minute. Every response updates shared state. Higher readings from another node do not erase the conservative remaining estimate; refill uses the app's allocated share. A zero Retry-After is unknown; 429 waits use the largest of reserve refill time, positive Retry-After, and exponential backoff with jitter.

Configure `JIRA_RATE_FRACTION` (>0–1), `JIRA_RATE_RESERVE_FRACTION` (0–0.9), `JIRA_MAX_CONCURRENCY` (1–20), and `JIRA_RATE_RETRY_BUDGET_MS` (1000–600000). In `/admin/jira`, an optional requests-per-minute budget adds a cap without overriding header-derived pacing. Manual refresh and discovery share the limiter. Manual cooldown remains enforced. URL/PAT changes require all active and queued syncs on the connection to finish (otherwise the API returns 409); request budgets and display names remain editable. Identity changes atomically clear cached issue details and limiter state. OAuth reconnects also require an idle connection and always invalidate cached details, including when Atlassian omits the account ID. Each credential replacement advances an authorization generation: old clients cannot write rate observations, validation results, or refreshed OAuth tokens back after replacement. Normal token refresh does not advance that generation.

Each sync reconciles board, hold, and completed membership. Complete inline changelogs avoid detail requests; truncated expansions fall back to issue endpoints. Raw history and latest comments are cached by connection/issue/updated timestamp and expire after `SYNC_FULL_RESYNC_HOURS` (24). Missing timestamps cannot establish that an issue is unchanged. If Jira cannot supply complete history even through fallback, sync fails explicitly rather than publishing truncated lifecycle data.

Requests retry in place until the elapsed-time budget expires, including requests blocked by another process or sibling request hitting the shared limit. Then the run returns to queued with `RATE_LIMITED` and a resume time. Completed batches stay staged while queued; terminal cancellation removes retained stages. The resume time honors retry deadlines observed by any client sharing the connection limiter. The dispatcher resumes the same run ID, scans membership from the beginning, and re-normalizes issues against the current board mapping. Unchanged issues reuse cached raw histories without repeating detail requests; changed or undated issues refresh their details; departed rows are pruned atomically before publication; offset checkpoints would be unsafe with Jira's live ordering. Graceful shutdown queues active runs; a lost worker heartbeat is recovered after 60 minutes. A unique lease token prevents an older attempt from publishing over or releasing a replacement attempt.

Dispatch adds up to one minute of jitter. Rate-limit pressure doubles the next normal interval. Permanent 403/404 failures back off for 15, 30, then 60 minutes and flag `needs_attention` after `SYNC_PERMANENT_FAILURE_LIMIT` failures (default 3). Fix Jira access or board selection, then save the scope to reactivate it. Self-hosted intervals accept 5–1440 minutes; new scopes use `DEFAULT_SYNC_INTERVAL_MINUTES`.

The admin page shows observed limit/remaining with observation time and requests per scope for the current UTC day. Totals are recorded when each attempt ends; a process crash can lose that attempt's usage summary. Request metrics carry connection_id and scope_id. Structured attempt summaries carry syncRunId, requests, 429s, paused milliseconds, and fetched/skipped issue counts. Run IDs stay out of Prometheus labels to avoid creating new time series on every sync. Gauges expose `agile_tools_jira_rate_limit` and `agile_tools_jira_rate_remaining`; `agile_tools_jira_throttle_wait_seconds` records waits.

Load `ops/prometheus/jira-rate-limits.rules.yml` through Prometheus's `rule_files` to alert above 1% 429 responses over 15 minutes. Check label names if your scraper relabels metrics. No alert is installed on an external Prometheus server by this code change.

Focused validation:

```sh
pnpm exec vitest run packages/shared/src/jira-rate-limit.test.ts packages/jira-client/src/client.test.ts apps/worker/src/sync/issue-cache.test.ts
pnpm exec vitest run --config tests/integration/vitest.config.ts tests/integration/jira-rate-sync.integration.test.ts
```

The virtual-clock test uses the exact 240/120/60 headers across 12 concurrent scopes. The Postgres suite accelerates refill for full 12-scope persistence, request reduction, resume, and permanent-failure tests. Neither establishes the live Jira account's configuration or exemptions. Compare production request totals after rollout against the prior baseline.
