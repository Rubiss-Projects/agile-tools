---
## Iteration 15 - 2026-04-18
**User Story**: US2 complete — T027, T028, T029, T030 (Reveal Aging and On-Hold Stories)
**Tasks Completed**: 
- [x] T027: apps/web/src/server/views/flow-analytics.ts (pure shapeFlowAnalytics: groups FlowPoints into 3 series with stable Y ordinals) + apps/web/src/components/flow/flow-filters.tsx (FlowFiltersPanel with timeframe/issueType/status/agingOnly/onHoldOnly) + apps/web/src/components/flow/aging-scatter-plot.tsx (nivo ResponsiveScatterPlot, threshold lines via createThresholdLayer, click → onItemSelect, aria-label)
- [x] T028: apps/web/src/components/flow/work-item-detail-drawer.tsx (fixed side-panel: fetches /items/:id on mount) + apps/web/src/components/flow/flow-analytics-section.tsx (client island: fetch /flow on mount+filter-change, renders scatter plot + drawer) + apps/web/src/components/admin/hold-definition-form.tsx (collapsible GET/PUT hold-definition form) + apps/web/src/app/scopes/[scopeId]/page.tsx (adds FlowAnalyticsSection + HoldDefinitionForm in filterOptions guard block)
- [x] T029: tests/integration/flow-analytics.integration.test.ts (pure unit tests for buildAgingThresholdModel + classifyAgingZone; DB integration for rebuildHoldPeriods + queryCurrentWorkItems with aging zone classification)
- [x] T030: tests/e2e/flow-analytics.spec.ts (page.route mocks for /flow and /items/:id; scatter plot visible, filter controls visible, detail API accessible for admins, hold definition form visible for admins)
**Commit**: feat(001-kanban-flow-forecasting): US-002 Reveal Aging and On-Hold Stories
**Files Changed**: 
- apps/web/src/server/views/flow-analytics.ts (new)
- apps/web/src/components/flow/flow-filters.tsx (new)
- apps/web/src/components/flow/aging-scatter-plot.tsx (new)
- apps/web/src/components/flow/work-item-detail-drawer.tsx (new)
- apps/web/src/components/flow/flow-analytics-section.tsx (new)
- apps/web/src/components/admin/hold-definition-form.tsx (new)
- apps/web/src/app/scopes/[scopeId]/page.tsx (added FlowAnalyticsSection + HoldDefinitionForm)
- tests/integration/flow-analytics.integration.test.ts (new)
- tests/e2e/flow-analytics.spec.ts (new)
- eslint.config.mjs (disabled react-hooks/exhaustive-deps for new flow components — eslint-plugin-react-hooks@4.x crashes on ESLint 9)
- specs/001-kanban-flow-forecasting/tasks.md (T027–T030 marked complete)
**Learnings**:
- eslint-plugin-react-hooks@4.6.2 is incompatible with ESLint 9: context.getSource() was removed. This crashes the exhaustive-deps rule for any useEffect/useCallback. Workaround: disable the rule per-file until plugin is upgraded to v5.
- With exactOptionalPropertyTypes: true, Zod .optional() produces T | undefined which is NOT assignable to optional props typed as ?: T. Fix: reconstruct objects with conditional spreads (..{key !== undefined && { key }}).
- createThresholdLayer pattern (closure returning a React FunctionComponent used as a nivo custom SVG layer) avoids useMemo entirely — layer is cheap to recreate on each render.
- nivo ScatterPlotNodeData.xValue is already typed as number when using ScatterDatum with x: number — no cast needed.
---


**User Story**: Partial progress on US2 — T026 (flow analytics + work-item detail APIs)
**Tasks Completed**: 
- [x] T026: packages/db/src/projections/current-work-item-projection.ts (added getLatestAgingThresholdModel returning full model with p70/sampleSize/metricBasis/lowConfidenceReason) + packages/db/src/repositories/work-items.ts (new — getWorkItemWithDetail with lifecycleEvents + holdPeriods) + packages/db/src/index.ts (re-export work-items) + apps/web/src/app/api/v1/scopes/[scopeId]/flow/route.ts (GET — requireWorkspaceContext, parse issueTypeIds/statusIds/historicalWindowDays/agingOnly/onHoldOnly/dataVersion, query work items, apply in-memory filters, return FlowAnalyticsResponse) + apps/web/src/app/api/v1/scopes/[scopeId]/items/[workItemId]/route.ts (GET — requireWorkspaceContext, verify scope ownership, return WorkItemDetail with hold periods and lifecycle events)
**Tasks Remaining in Story**: T027, T028, T029, T030
**Commit**: No commit - partial progress
**Files Changed**: 
- packages/db/src/projections/current-work-item-projection.ts (added getLatestAgingThresholdModel)
- packages/db/src/repositories/work-items.ts (new)
- packages/db/src/index.ts (re-export work-items)
- apps/web/src/app/api/v1/scopes/[scopeId]/flow/route.ts (new)
- apps/web/src/app/api/v1/scopes/[scopeId]/items/[workItemId]/route.ts (new)
- specs/001-kanban-flow-forecasting/tasks.md (T026 marked complete)
**Learnings**:
- `getLatestAgingThresholds` returns only {p50, p85} — added `getLatestAgingThresholdModel` alongside it for routes that need p70, sampleSize, metricBasis, and lowConfidenceReason (the full shape for FlowAnalyticsResponse.agingModel)
- Workspace ownership for work items is enforced by verifying scopeId belongs to workspaceId first (via getFlowScope), then querying workItem by (id, scopeId) — no join needed since scope membership implies workspace membership
- In-memory filtering is appropriate here given the plan target of "hundreds of active stories" per scope
---

---
## Iteration 13 - 2026-04-18
**User Story**: Partial progress on US2 — T025 (enrich current flow projections with aging zones + on-hold state)
**Tasks Completed**: 
- [x] T025: apps/worker/src/projections/rebuild-current-flow.ts (new — rebuildCurrentFlowProjection: queries completed stories within 90-day window, calls buildAgingThresholdModel, upserts AgingThresholdModel) + packages/db/src/projections/current-work-item-projection.ts (added AgingThresholds interface, getLatestAgingThresholds helper, inline classifyAgingZone, optional agingThresholds param on queryCurrentWorkItems) + apps/worker/src/projections/rebuild-scope-summary.ts (wired rebuildHoldPeriods + rebuildCurrentFlowProjection into rebuildScopeProjections)
**Tasks Remaining in Story**: T026, T027, T028, T029, T030
**Commit**: No commit - partial progress
**Files Changed**: 
- apps/worker/src/projections/rebuild-current-flow.ts (new)
- packages/db/src/projections/current-work-item-projection.ts (AgingThresholds, getLatestAgingThresholds, classifyAgingZone, options.agingThresholds)
- apps/worker/src/projections/rebuild-scope-summary.ts (wired rebuildHoldPeriods + rebuildCurrentFlowProjection)
- specs/001-kanban-flow-forecasting/tasks.md (T025 marked complete)
**Learnings**:
- @agile-tools/analytics resolves via dist/ — must run `pnpm --filter @agile-tools/analytics run build` before typechecking worker; this is already the pattern from previous iterations (same for @agile-tools/db)
- To avoid a db→analytics circular dependency (analytics may depend on db in later tasks), classifyAgingZone is inlined in current-work-item-projection.ts rather than imported from @agile-tools/analytics
- getLatestAgingThresholds is exposed from packages/db via the existing `export *` in index.ts — no manual re-export needed
- rebuild-scope-summary.ts was already identified as the extension point (commented "US1 lightweight hook"); T025 fulfils that by adding hold period + aging model rebuilds before the diagnostic log
---


**User Story**: Partial progress on US2 — T023 + T024 (hold-definition persistence + hold-period/aging-threshold builders)
**Tasks Completed**: 
- [x] T023: packages/db/src/repositories/hold-definitions.ts (upsertHoldDefinition, getActiveHoldDefinition) + apps/web/src/app/api/v1/admin/scopes/[scopeId]/hold-definition/route.ts (GET + PUT handlers with admin auth, validation, mapHoldDefinition) + packages/db/src/index.ts (re-export hold-definitions)
- [x] T024: packages/analytics/src/aging-thresholds.ts (buildAgingThresholdModel with p50/p70/p85 percentiles, classifyAgingZone, AGING_CONFIDENCE_THRESHOLD=30) + apps/worker/src/projections/rebuild-hold-periods.ts (rebuildHoldPeriods: deletes+rebuilds all HoldPeriod records for a scope using active HoldDefinition + lifecycle events) + packages/analytics/src/index.ts (export aging-thresholds)
**Tasks Remaining in Story**: T025, T026, T027, T028, T029, T030
**Commit**: No commit - partial progress
**Files Changed**: 
- packages/db/src/repositories/hold-definitions.ts (new)
- packages/db/src/index.ts (added hold-definitions re-export)
- apps/web/src/app/api/v1/admin/scopes/[scopeId]/hold-definition/route.ts (new)
- apps/worker/src/projections/rebuild-hold-periods.ts (new)
- packages/analytics/src/aging-thresholds.ts (new)
- packages/analytics/src/index.ts (replaced placeholder with aging-thresholds export)
- specs/001-kanban-flow-forecasting/tasks.md (T023 + T024 marked complete)
**Learnings**:
- exactOptionalPropertyTypes: true means { a?: string } does NOT accept { a: string | undefined } — use conditional spread `...(val !== undefined && { a: val })` when building input objects from Zod-parsed data where optional fields may be undefined
- After editing packages/db/src/index.ts to add a new export, the dist/ must be rebuilt (pnpm run build in packages/db) before apps/worker and apps/web can resolve the new export via their dist-based dependency resolution
- blocked_field hold period derivation requires the "to" value of field_change lifecycle events, which is not currently stored in the WorkItemLifecycleEvent schema (only changedFieldId is persisted). Status-based hold derivation is fully implemented; blocked_field is deferred until schema stores changedFieldValue
- The admin hold-definition route needs ../../_lib (not ../_lib) because it sits at [scopeId]/hold-definition/route.ts and _lib.ts is at scopes/_lib.ts
---


**User Story**: US1 complete — T021 + T022 (contract, integration, and E2E tests)
**Tasks Completed**: 
- [x] T021: tests/contract/admin-jira-connections.contract.test.ts (12 contract tests for POST connection, POST validate healthy/unhealthy, GET boards, GET board detail, 401/403 auth) + tests/contract/admin-scopes.contract.test.ts (12 contract tests for POST scope, PUT scope, POST sync, GET syncs, 400/401/404 error paths)
- [x] T022: tests/integration/sync-pipeline.integration.test.ts (9 pure unit tests for normalizeJiraIssue + 9 DB integration tests for queryCurrentWorkItems/queryScopeFilterOptions) + tests/e2e/admin-jira-setup.spec.ts (3 Playwright E2E specs for admin/jira and /scopes/:id pages)
**Tasks Remaining in Story**: None — US1 complete ✅
**Commit**: feat(001-kanban-flow-forecasting): US-001 Connect Self-Hosted Jira and See Team Flow
**Files Changed**: 
- tests/contract/vitest.config.ts (added resolve.alias for @, next/server, next/headers, next/navigation, next/cache; added next dir var)
- tests/contract/admin-jira-connections.contract.test.ts (new)
- tests/contract/admin-scopes.contract.test.ts (new)
- tests/integration/sync-pipeline.integration.test.ts (new)
- tests/e2e/admin-jira-setup.spec.ts (new)
- tests/msw/jira-handlers.ts (added GET /rest/api/2/status + GET /rest/agile/1.0/board/:boardId/project handlers)
- package.json (added @agile-tools/db, @agile-tools/jira-client, @agile-tools/shared, @prisma/client to root devDependencies for test resolution)
- specs/001-kanban-flow-forecasting/tasks.md (T021 + T022 marked complete)
**Learnings**:
- In a pnpm monorepo, workspace packages must be added to the root package.json devDependencies for root-level test tooling (vitest) to resolve them. Vitest runs from the root and cannot hoist packages from child workspaces.
- Next.js packages (next/server, next/headers) are installed under apps/web/node_modules and require explicit resolve.alias entries in root-level vitest configs. Use path.join(nextDir, 'server.js') etc.
- vi.mock calls are hoisted before imports in Vitest, so dynamic imports (via await import()) after vi.mock correctly receive the mocked module. This is the correct pattern for mocking next/headers cookies in contract tests.
- When contract/integration tests share a single Postgres container, use an ensureDbStarted() helper with a module-level flag to avoid starting duplicate containers across multiple describe-level beforeAll hooks.
- Testcontainers needs Docker Desktop (Linux engine) running on Windows. Tests correctly skip with "Could not find a working container runtime strategy" when Docker is unavailable — this is the expected behaviour in environments without Docker.
---


**User Story**: Partial progress on US1 — T020 (admin setup screens + scope summary page)
**Tasks Completed**: 
- [x] T020: apps/web/src/app/admin/jira/page.tsx (Server Component: requireAdminContext, listJiraConnections + listFlowScopes, renders connection list with ValidateConnectionButton, JiraConnectionForm, scope list, FlowScopeForm) + apps/web/src/components/admin/jira-connection-form.tsx (JiraConnectionForm + ValidateConnectionButton client components) + apps/web/src/components/admin/flow-scope-form.tsx (multi-step FlowScopeForm: discover boards → inspect board → configure + submit) + apps/web/src/app/scopes/[scopeId]/page.tsx (Server Component: buildScopeSummary, scope/health/sync/warnings/filterOptions/config display + TriggerSyncButton for admin) + apps/web/src/components/admin/trigger-sync-button.tsx (TriggerSyncButton client component with router.refresh())
**Tasks Remaining in Story**: T021, T022
**Commit**: No commit - partial progress
**Files Changed**: 
- apps/web/src/app/admin/jira/page.tsx (new)
- apps/web/src/components/admin/jira-connection-form.tsx (new)
- apps/web/src/components/admin/flow-scope-form.tsx (new)
- apps/web/src/app/scopes/[scopeId]/page.tsx (new)
- apps/web/src/components/admin/trigger-sync-button.tsx (new)
- eslint.config.mjs (browser globals for apps/web)
**Learnings**:
- ESLint flat config requires an explicit globals block for browser globals (fetch, window, etc.) scoped to apps/web — they are not inherited from js.configs.recommended
- Async event handlers in JSX must be wrapped with void to satisfy @typescript-eslint/no-misused-promises: `onClick={() => { void handleAction(); }}`
- onSubmit must also use void wrapper: `onSubmit={(e) => { void handleSubmit(e); }}` with FormEvent<HTMLFormElement> type
- Server Component pages should use getWorkspaceContext() (not require*) and guard ctx early before accessing ctx.workspaceId or ctx.role
- router.refresh() from next/navigation is the correct pattern for re-triggering server component data fetching after client-side mutations
- TriggerSyncButton, ValidateConnectionButton should also call router.refresh() after success so server-rendered health/lastSync fields update
---


**User Story**: Partial progress on US1 — T019 (scope summary read API + view shaping)
**Tasks Completed**: 
- [x] T019: packages/db/src/repositories/sync-runs.ts (added getLastSucceededSyncRun — finds most recent succeeded run with a dataVersion, used to pin projection filter options to a stable snapshot) + apps/web/src/server/views/scope-summary.ts (buildScopeSummary: fetches scope, connection health, last sync run, and pinned filter options concurrently; omits filterOptions when no succeeded sync exists; emits connection/drift warnings) + apps/web/src/app/api/v1/scopes/[scopeId]/route.ts (GET handler; requireWorkspaceContext; 404 on missing scope)
**Tasks Remaining in Story**: T020, T021, T022
**Commit**: No commit - partial progress
**Files Changed**: 
- packages/db/src/repositories/sync-runs.ts (getLastSucceededSyncRun function)
- apps/web/src/server/views/scope-summary.ts (new)
- apps/web/src/app/api/v1/scopes/[scopeId]/route.ts (new)
**Learnings**:
- Must pin filter options (queryScopeFilterOptions) to the latest *succeeded* sync's dataVersion, not the latest run — a queued/failed/running run would cause mixed-state reads during in-progress syncs
- Omit filterOptions entirely when no succeeded sync exists so the UI can distinguish "not yet synced" vs "synced and empty"
- View functions in apps/web/src/server/views/ call getPrismaClient() internally rather than accepting a PrismaClient param (avoids the Prisma type import constraint in apps/web)
- Import mapScope/mapSyncRun from @/app/api/v1/admin/scopes/_lib (already defined there) rather than duplicating
---


**User Story**: Partial progress on US1 — T018 (current flow + scope summary projections)
**Tasks Completed**: 
- [x] T018: packages/db/prisma/schema.prisma + migration (added issueTypeName to WorkItem) + apps/worker/src/sync/normalize-jira-issues.ts (added issueTypeName field) + apps/worker/src/sync/run-scope-sync.ts (includes issueTypeName in upsert, calls rebuildScopeProjections after sync success) + packages/db/src/projections/current-work-item-projection.ts (queryCurrentWorkItems, queryScopeFilterOptions with dataVersion pinning) + apps/worker/src/projections/rebuild-scope-summary.ts (lightweight post-sync hook that logs item counts and filter options)
**Tasks Remaining in Story**: T019, T020, T021, T022
**Commit**: No commit - partial progress
**Files Changed**: 
- packages/db/prisma/schema.prisma (issueTypeName field on WorkItem)
- packages/db/prisma/migrations/20260418_work_item_issue_type_name/migration.sql (new)
- packages/db/src/projections/current-work-item-projection.ts (new)
- packages/db/src/index.ts (re-export projections)
- apps/worker/src/sync/normalize-jira-issues.ts (issueTypeName in NormalizedWorkItem)
- apps/worker/src/sync/run-scope-sync.ts (issueTypeName in upsert, rebuildScopeProjections call)
- apps/worker/src/projections/rebuild-scope-summary.ts (new)
**Learnings**:
- Current work item projection is computed on-the-fly (no materialized table in schema); `queryCurrentWorkItems` and `queryScopeFilterOptions` accept an optional `dataVersion` parameter (= syncRunId) to filter by `lastSyncRunId` and exclude stale items that disappeared from the board between syncs
- issueTypeName must be stored in WorkItem at sync time — Jira status names can be derived from currentColumn (board column name) but issue type names are not otherwise queryable after sync
- For `filterOptions.statuses`: id = Jira status ID (for server-side filtering), name = currentColumn (board column name for display) — this lets the UI show meaningful column names while the API correctly filters by status ID
- `rebuildScopeProjections` is non-blocking (errors are caught + logged, not re-thrown) so projection diagnostics never fail a sync
---


**User Story**: US1 T017 — Scheduled refresh, connection health, board drift
**Tasks Completed**: 
- [x] T017: apps/worker/src/jobs/schedule-scope-syncs.ts (dispatch job fires every minute, queries active scopes, enqueues scope:sync for any scope whose syncIntervalMinutes has elapsed — fixes pg-boss schedule-name/queue-name mismatch from T008) + apps/worker/src/sync/update-connection-health.ts (updateConnectionHealthAfterSync: healthy on success; unhealthy on JIRA_AUTH_ERROR/JIRA_HTTP_ERROR; no change for config/drift errors) + apps/worker/src/sync/detect-board-drift.ts (detectBoardDrift compares scope startStatusIds/doneStatusIds against live board columns; applyBoardDriftHandling marks scope needs_attention) + apps/worker/src/sync/run-scope-sync.ts (integrates drift abort before writes, maps JiraClientError to typed codes, calls health updater on success and connection failures) + apps/worker/src/jobs/register-jobs.ts (wires dispatch job) + apps/worker/src/lib/worker.ts (passes db to registerJobs) + eslint.config.mjs (Node.js globals for worker)
**Tasks Remaining in Story**: T018, T019, T020, T021, T022
**Commit**: bd8eb71
**Files Changed**: 
- apps/worker/src/jobs/schedule-scope-syncs.ts (new)
- apps/worker/src/sync/detect-board-drift.ts (new)
- apps/worker/src/sync/update-connection-health.ts (new)
- apps/worker/src/sync/run-scope-sync.ts
- apps/worker/src/jobs/register-jobs.ts
- apps/worker/src/lib/worker.ts
- eslint.config.mjs
**Learnings**:
- pg-boss `schedule(name, cron, data)` uses `name` as both the schedule ID AND the destination queue name — so per-scope schedules with `scope:sync:${scopeId}` names go to queues nobody works; fix is a single dispatch cron job that queries the DB and enqueues to the real `scope:sync` queue
- Board drift must abort the sync BEFORE any writes (snapshot, work items, lifecycle events) — continuing would produce incorrect startedAt/completedAt because those fields depend on startStatusIds/doneStatusIds matching real board statuses
- JiraClientError.code values: `unauthorized`, `forbidden`, `not_found`, `http_error` — map 401/403 → JIRA_AUTH_ERROR; others → JIRA_HTTP_ERROR for health classification
- Connection health should NOT be updated for non-connectivity failures (SCOPE_NOT_FOUND, BOARD_DRIFT_DETECTED, UNEXPECTED_ERROR) — the Jira link may still be functional
- ESLint flat config requires explicit `languageOptions.globals` for Node.js globals (process, console, Buffer) — not inherited from `js.configs.recommended`
---



Feature: 001-kanban-flow-forecasting
Started: 2026-04-17 23:02:35

## Codebase Patterns

- pnpm workspace monorepo: `apps/*` and `packages/*`
- Two TS base configs: `tsconfig.web.json` (bundler/ESNext for Next.js) and `tsconfig.node.json` (NodeNext for worker + libs); all extend `tsconfig.base.json` (strict settings only)
- Internal packages use `"type": "module"` + `exports` map pointing to `dist/`; cross-package refs use `workspace:*`
- `apps/web` builds with `next build`; all other packages build with `tsc`
- Root devDependencies holds shared tooling (vitest, playwright, typescript, eslint) — packages declare their own `typescript` for IDE support but rely on workspace hoisting
- Package naming convention: `@agile-tools/<name>` (e.g., `@agile-tools/db`, `@agile-tools/shared`)
- `@agile-tools/shared` exports contracts via subpath `@agile-tools/shared/contracts/api` — the root `@agile-tools/shared` only exports config, secrets, and logging
- Cross-package type resolution requires the dependency to be built (`pnpm --filter X build`) before typechecking a consumer
- Prisma client must be regenerated (`prisma generate`) after every schema change before `tsc` can resolve `@prisma/client` types
- Repository functions use free-function style with `PrismaClient` as first arg; they catch `PrismaClientKnownRequestError P2025` and return `null` for not-found
- `FlowScope.boardId` is stored as `String` in Postgres; repositories accept `number` and convert with `String()`; callers convert back
- Route handlers MUST use `ResponseError` (not `throw Response.json(...)`) to satisfy `@typescript-eslint/only-throw-error`; import from `@/server/errors`
- `auth.ts` requires `/* global Buffer */` comment at top for the Node.js `Buffer` global
- Prisma types are NOT directly importable in `apps/web`; infer with `NonNullable<Awaited<ReturnType<typeof repoFn>>>`

## Iteration 6 - 2026-04-18
**User Story**: US1 T016 — Jira sync pipeline
**Tasks Completed**: 
- [x] T016: apps/worker/src/sync/normalize-jira-issues.ts (RawJiraIssue → NormalizedWorkItem with lifecycle events, startedAt/completedAt derivation) + apps/worker/src/sync/run-scope-sync.ts (full sync orchestrator: atomic SyncRun claim, board snapshot upsert, paginated issue streaming, batch-10 concurrent processing, idempotent WorkItem+LifecycleEvent writes) + packages/db/src/repositories/sync-runs.ts (updateSyncRun function) + apps/worker/src/jobs/register-jobs.ts (wire runScopeSync, manual syncs use pre-created syncRunId, scheduled syncs call createSyncRun)
**Tasks Remaining in Story**: T017, T018, T019, T020, T021, T022
**Commit**: 4e731af

---


**User Story**: US1 T015 — Admin scope and sync status routes
**Tasks Completed**: 
- [x] T015: packages/db/src/repositories/sync-runs.ts (createSyncRun, getSyncRun workspace-scoped, listSyncRuns, getActiveSyncRun) + apps/web/src/server/errors.ts (ResponseError class) + apps/web/src/server/queue.ts (lazy pg-boss publisher for web, enqueueScopeSyncJob) + apps/web/src/app/api/v1/admin/scopes/route.ts (POST create, fetches real boardName from Jira) + apps/web/src/app/api/v1/admin/scopes/[scopeId]/route.ts (PUT update) + apps/web/src/app/api/v1/admin/scopes/[scopeId]/syncs/route.ts (POST manual sync with 409 guard + GET list) + apps/web/src/app/api/v1/syncs/[syncRunId]/route.ts (GET status, workspace-scoped)
**Tasks Remaining in Story**: T016, T017, T018, T019, T020, T021, T022
**Commit**: d549efe
**Files Changed**: 
- packages/db/src/repositories/sync-runs.ts
- packages/db/src/index.ts (re-export sync-runs)
- apps/web/package.json (added pg-boss)
- apps/web/next.config.ts (pg-boss in serverExternalPackages)
- apps/web/src/server/errors.ts (new ResponseError class)
- apps/web/src/server/queue.ts (lazy pg-boss publisher)
- apps/web/src/server/auth.ts (use ResponseError, add /* global Buffer */)
- apps/web/src/app/api/v1/admin/scopes/_lib.ts
- apps/web/src/app/api/v1/admin/scopes/route.ts
- apps/web/src/app/api/v1/admin/scopes/[scopeId]/route.ts
- apps/web/src/app/api/v1/admin/scopes/[scopeId]/syncs/route.ts
- apps/web/src/app/api/v1/syncs/[syncRunId]/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/_lib.ts (ResponseError import)
- apps/web/src/app/api/v1/admin/jira-connections/route.ts (ResponseError catch)
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/validate/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/[boardId]/route.ts
**Learnings**:
- `@typescript-eslint/only-throw-error` forbids `throw Response.json(...)` — must wrap in `ResponseError extends Error`; route handlers catch `ResponseError` and return `err.response`
- `SyncRun` has no `workspaceId` column; workspace scope is enforced via Prisma nested `where: { scope: { workspaceId } }` filter
- pg-boss `singletonKey` deduplicates queued jobs at the queue level; the web app also guards via `getActiveSyncRun` DB check before creating a SyncRun record
- Manual sync: Create SyncRun in DB first, then best-effort pg-boss enqueue; log warn on enqueue failure but still return 202 with the SyncRun
- `boardName` must be fetched from Jira at scope creation/update time — do not default to boardId string
- `CreateFlowScopeRequestSchema` does not include `boardName`; route looks it up via `getBoardDetail` using the provided `connectionId`+`boardId`
---


---

## Iteration 3 - 2026-04-17
**User Story**: US1 T012 + T013 (parallel foundational tasks)
**Tasks Completed**: 
- [x] T012: packages/db/src/repositories/jira-connections.ts (createJiraConnection, getJiraConnection, listJiraConnections, updateConnectionHealth, deleteJiraConnection) + packages/db/src/repositories/flow-scopes.ts (createFlowScope, getFlowScope, listFlowScopes, updateFlowScope, updateFlowScopeStatus, deleteFlowScope) — also added displayName to JiraConnection schema + migration
- [x] T013: packages/jira-client/src/client.ts (JiraClient class, bearer auth, p-retry/p-limit, validateConnection with both /myself and Agile board check) + packages/jira-client/src/discovery.ts (listBoards, getBoardDetail) + packages/jira-client/src/issues.ts (fetchBoardIssues, streamBoardIssues with de-dup, fetchIssueChangelog)
**Tasks Remaining in Story**: T014, T015, T016, T017, T018, T019, T020, T021, T022
**Commit**: 9b43de8
**Files Changed**: 
- packages/db/prisma/schema.prisma (added displayName)
- packages/db/prisma/migrations/20260418_jira_connection_display_name/migration.sql
- packages/db/src/repositories/jira-connections.ts
- packages/db/src/repositories/flow-scopes.ts
- packages/db/src/index.ts (re-export repositories)
- packages/jira-client/src/client.ts
- packages/jira-client/src/discovery.ts
- packages/jira-client/src/issues.ts
- packages/jira-client/src/index.ts (full exports)
- specs/001-kanban-flow-forecasting/tasks.md
**Learnings**:
- `@agile-tools/shared` root export only exposes config/secrets/logging; contracts require the subpath `@agile-tools/shared/contracts/api`
- When using `@@unique([workspaceId, id])` in Prisma, the compound accessor is `workspaceId_id`; using `findFirst` + `update(id)` or catching `P2025` are both safe alternatives
- `p-retry` AbortError wraps an existing Error (not just a string) to propagate the underlying JiraClientError through the retry wrapper
- `FlowScope` update uses `where: { id, workspaceId }` compound filter which Prisma accepts in update() when both fields form a unique constraint path

---
## Iteration 4 - 2026-04-17
**User Story**: US1 T014 — Admin Jira connection + discovery routes
**Tasks Completed**: 
- [x] T014: apps/web/src/app/api/v1/admin/jira-connections/_lib.ts (mapConnection, requireJiraConnection, createClientForConnection, normalizeJiraError helpers) + route.ts (POST create connection, encrypts PAT) + [connectionId]/validate/route.ts (POST validate — sets validating state, calls Jira, updates health to healthy/unhealthy) + [connectionId]/discovery/boards/route.ts (GET list boards) + [connectionId]/discovery/boards/[boardId]/route.ts (GET board detail with strict integer boardId validation)
**Tasks Remaining in Story**: T015, T016, T017, T018, T019, T020, T021, T022
**Commit**: (see git log)
**Files Changed**: 
- apps/web/package.json (added @agile-tools/jira-client workspace dep)
- apps/web/next.config.ts (moved to serverExternalPackages, added jira-client)
- apps/web/src/app/api/v1/admin/jira-connections/_lib.ts
- apps/web/src/app/api/v1/admin/jira-connections/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/validate/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/route.ts
- apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/[boardId]/route.ts
- pnpm-lock.yaml
**Learnings**:
- Next.js 16 uses `serverExternalPackages` (top-level) not `experimental.serverComponentsExternalPackages` — apply to packages with ESM-only deps or native bindings
- Prisma types are not directly importable in the web app; use `NonNullable<Awaited<ReturnType<typeof repoFn>>>` to infer DB record types from repository functions
- `exactOptionalPropertyTypes: true` requires spreading optional values with `...(x !== undefined && { key: x })` — passing `key: x | undefined` is a type error
- In Next.js App Router, dynamic route params are `Promise<{key: string}>` and must be `await`-ed before accessing
- The `validating` health state should be set before the Jira call so concurrent observers see the in-progress transition; then updated to `healthy` or `unhealthy` after
- Outer try/catch returns thrown `Response` objects (from auth helpers); inner try/catch around Jira calls handles `JiraClientError` specifically
---

---

## Iteration 2 - 2026-04-19
**User Story**: Phase 2 Foundational (Blocking Prerequisites)
**Tasks Completed**: 
- [x] T004: Prisma schema (11 models, 6 enums) + base migration SQL with btree_gist extension, CHECK constraints, exclusion constraint for HoldPeriod non-overlap; composite FK FlowScope→JiraConnection(workspaceId, id)
- [x] T005: packages/db/src/client.ts (Prisma singleton), packages/db/src/index.ts (barrel)
- [x] T006: packages/shared/src/config.ts (Zod env validation), packages/shared/src/secrets.ts (AES-256-GCM), packages/shared/src/logging.ts (structured JSON logger), packages/shared/src/index.ts
- [x] T007: apps/web/src/app/layout.tsx, apps/web/src/server/auth.ts (workspace context), apps/web/src/server/index.ts, apps/web/next.config.ts, apps/worker/src/index.ts (graceful shutdown), apps/worker/src/lib/worker.ts
- [x] T008: apps/worker/src/lib/queue.ts (pg-boss singleton, scheduleScopeSync, unscheduleScopeSync, enqueueScopeSync), apps/worker/src/jobs/register-jobs.ts (handler stub)
- [x] T009: packages/shared/src/contracts/api.ts (all Zod/TS API contract types), packages/shared/src/contracts/forecast.ts (discriminated union ForecastRequest)
- [x] T010: vitest.config.ts (root unit), tests/contract/vitest.config.ts, tests/integration/vitest.config.ts, playwright.config.ts, tests/msw/jira-handlers.ts (MSW fixtures), tests/integration/support/postgres.ts (Testcontainers)
- [x] T011: apps/web/package.json + apps/worker/package.json — added lint, test, test:unit scripts
**Tasks Remaining in Phase**: None — Phase 2 complete ✅
**Commit**: (see git log)
**Files Changed**: 
- packages/db/prisma/schema.prisma, migration.sql, migration_lock.toml
- packages/db/src/client.ts, packages/db/src/index.ts
- packages/shared/src/config.ts, secrets.ts, logging.ts, index.ts
- packages/shared/src/contracts/api.ts, forecast.ts
- apps/web/src/app/layout.tsx, apps/web/src/server/auth.ts, apps/web/src/server/index.ts, apps/web/next.config.ts
- apps/web/package.json (lint, test, test:unit scripts)
- apps/worker/src/index.ts, apps/worker/src/lib/worker.ts, apps/worker/src/lib/queue.ts, apps/worker/src/jobs/register-jobs.ts
- apps/worker/package.json (lint, test, test:unit scripts)
- packages/analytics/src/index.ts, packages/jira-client/src/index.ts (placeholder stubs)
- vitest.config.ts, playwright.config.ts
- tests/contract/vitest.config.ts, tests/integration/vitest.config.ts
- tests/msw/jira-handlers.ts, tests/integration/support/postgres.ts
**Learnings**:
- Prisma client must be generated (`prisma generate`) before `tsc` can type-check packages depending on `@prisma/client`
- pg-boss v10 removed `teamSize`/`teamConcurrency` on `work()`; use `batchSize` in `WorkOptions`. `WorkHandler<T>` receives `Job<T>[]` (array), not a single job
- pg-boss v10 `ConstructorOptions` no longer has `noSupervisor` — removed
- pnpm monorepo with `exports` pointing to `./dist/` requires packages to be built before cross-package type resolution works; `pnpm --filter X build` before `pnpm typecheck`
- Empty packages (no `.ts` files) fail `tsc` with "No inputs found" — add a minimal `src/index.ts` placeholder
---
---
## Iteration 1 - 2026-04-18
**User Story**: Phase 1 Setup (Shared Infrastructure)
**Tasks Completed**: 
- [x] T001: pnpm workspace, root package.json, tsconfig.base.json (+ tsconfig.web.json, tsconfig.node.json per rubber-duck feedback)
- [x] T002: Package manifests for apps/web, apps/worker, packages/db, packages/jira-client, packages/analytics, packages/shared — each with tsconfig.json extending root node/web configs
- [x] T003: docker-compose.yml (postgres:16-alpine with healthcheck), .env.example, .gitignore, eslint.config.mjs (ESLint 9 flat config)
**Tasks Remaining in Story**: None - phase complete
**Commit**: c0f1dbe
**Files Changed**: 
- package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.web.json, tsconfig.node.json
- apps/web/package.json, apps/web/tsconfig.json
- apps/worker/package.json, apps/worker/tsconfig.json
- packages/db/package.json, packages/db/tsconfig.json
- packages/jira-client/package.json, packages/jira-client/tsconfig.json
- packages/analytics/package.json, packages/analytics/tsconfig.json
- packages/shared/package.json, packages/shared/tsconfig.json
- docker-compose.yml, .env.example, .gitignore, eslint.config.mjs
**Learnings**:
- Split TS configs early: `bundler` moduleResolution is Next.js-only; worker + libs need `NodeNext`
- `apps/web` build must use `next build`, not `tsc`
- Postgres compose healthcheck prevents migration races on `docker compose up -d`
- Vitest kept in root devDeps only; avoid per-package `"vitest": "*"` (it's not inheritance)
---

