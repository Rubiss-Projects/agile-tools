# Tasks: Kanban Flow Forecasting

**Input**: Design documents from `/specs/001-kanban-flow-forecasting/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/kanban-flow-api.openapi.yaml, quickstart.md

**Tests**: Targeted contract, integration, end-to-end, and performance tasks are included because the plan and constitution depend on them. The workflow does not require strict TDD, but each story must ship with the coverage appropriate to its risk.

**Organization**: Tasks are grouped by user story so each slice can be implemented and validated independently after shared prerequisites are complete.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the monorepo, package manifests, and local developer tooling.

- [x] T001 Create the pnpm workspace and root build scripts in package.json, pnpm-workspace.yaml, and tsconfig.base.json
- [x] T002 Scaffold package manifests for the web app, worker, and shared libraries in apps/web/package.json, apps/worker/package.json, packages/db/package.json, packages/jira-client/package.json, packages/analytics/package.json, and packages/shared/package.json
- [x] T003 [P] Add local developer runtime files in docker-compose.yml, .env.example, .gitignore, and eslint.config.mjs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the core persistence, configuration, runtime, and queue infrastructure required by every user story.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [x] T004 Define the initial Prisma schema and base migration for Workspace, JiraConnection, FlowScope, BoardSnapshot, HoldDefinition, SyncRun, WorkItem, WorkItemLifecycleEvent, HoldPeriod, AgingThresholdModel, and ForecastResultCache in packages/db/prisma/schema.prisma and packages/db/prisma/migrations/20260417_init/migration.sql
- [x] T005 [P] Implement shared database bootstrap and Prisma access helpers in packages/db/src/client.ts and packages/db/src/index.ts
- [x] T006 [P] Implement environment validation, secret encryption helpers, and structured logging in packages/shared/src/config.ts, packages/shared/src/secrets.ts, and packages/shared/src/logging.ts
- [x] T007 [P] Bootstrap the Next.js server shell, workspace auth context, and worker entrypoints in apps/web/src/app/layout.tsx, apps/web/src/server/auth.ts, apps/web/src/server/index.ts, apps/worker/src/index.ts, and apps/worker/src/lib/worker.ts
- [x] T008 Implement pg-boss queue registration, recurring job wiring, and per-scope sync locking in apps/worker/src/lib/queue.ts and apps/worker/src/jobs/register-jobs.ts
- [x] T009 [P] Create shared API/domain contract types for warnings, dataVersion snapshots, scope summaries, and forecast payloads in packages/shared/src/contracts/api.ts and packages/shared/src/contracts/forecast.ts
- [x] T010 [P] Create shared test configuration in vitest.config.ts, playwright.config.ts, tests/msw/jira-handlers.ts, and tests/integration/support/postgres.ts
- [x] T011 [P] Wire repository-wide validation commands in package.json and apps/web/package.json for lint, unit, contract, integration, end-to-end, and performance checks

**Checkpoint**: Foundation ready. User story work can now begin.

---

## Phase 3: User Story 1 - Connect Self-Hosted Jira and See Team Flow (Priority: P1) 🎯 MVP

**Goal**: Let an administrator configure a self-hosted Jira PAT connection, create a flow scope, synchronize data, and view the team’s current flow from local read models.

**Independent Test**: Create a Jira connection, validate it, discover a board, create a scope, trigger a manual sync, and confirm the scope page shows current flow data and sync health without requiring a spreadsheet export.

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement Jira connection and flow scope repositories in packages/db/src/repositories/jira-connections.ts and packages/db/src/repositories/flow-scopes.ts
- [x] T013 [P] [US1] Implement Jira PAT validation, board discovery, issue pagination, and changelog retrieval in packages/jira-client/src/client.ts, packages/jira-client/src/discovery.ts, and packages/jira-client/src/issues.ts
- [x] T014 [US1] Implement admin connection, validation, and board discovery routes with administrator authorization checks in apps/web/src/app/api/v1/admin/jira-connections/route.ts, apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/validate/route.ts, apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/route.ts, and apps/web/src/app/api/v1/admin/jira-connections/[connectionId]/discovery/boards/[boardId]/route.ts
- [x] T015 [US1] Implement scope creation, scope update, manual sync, and sync status routes with role-based access checks in apps/web/src/app/api/v1/admin/scopes/route.ts, apps/web/src/app/api/v1/admin/scopes/[scopeId]/route.ts, apps/web/src/app/api/v1/admin/scopes/[scopeId]/syncs/route.ts, and apps/web/src/app/api/v1/syncs/[syncRunId]/route.ts
- [x] T016 [US1] Implement the Jira sync pipeline to persist board snapshots, work items, lifecycle events, and sync runs in apps/worker/src/sync/run-scope-sync.ts and apps/worker/src/sync/normalize-jira-issues.ts
- [x] T017 [US1] Implement scheduled refresh, connection health updates, and board drift handling in apps/worker/src/jobs/schedule-scope-syncs.ts, apps/worker/src/sync/update-connection-health.ts, and apps/worker/src/sync/detect-board-drift.ts
- [x] T018 [US1] Build current flow and scope summary projections in apps/worker/src/projections/rebuild-scope-summary.ts and packages/db/src/projections/current-work-item-projection.ts
- [x] T019 [US1] Implement scope summary read APIs and server-side view shaping in apps/web/src/app/api/v1/scopes/[scopeId]/route.ts and apps/web/src/server/views/scope-summary.ts
- [x] T020 [US1] Build the admin setup screens and synced flow summary page in apps/web/src/app/admin/jira/page.tsx, apps/web/src/components/admin/jira-connection-form.tsx, apps/web/src/components/admin/flow-scope-form.tsx, and apps/web/src/app/scopes/[scopeId]/page.tsx
- [x] T021 [P] [US1] Add contract tests for admin connection, discovery, scope creation, and sync routes in tests/contract/admin-jira-connections.contract.test.ts and tests/contract/admin-scopes.contract.test.ts
- [x] T022 [P] [US1] Add integration tests for Jira sync normalization and projection publishing in tests/integration/sync-pipeline.integration.test.ts and end-to-end coverage for Jira connection, scope creation, sync, and flow summary in tests/e2e/admin-jira-setup.spec.ts

**Checkpoint**: User Story 1 should be fully functional and demonstrable as the MVP.

---

## Phase 4: User Story 2 - Reveal Aging and On-Hold Stories (Priority: P2)

**Goal**: Highlight aging and on-hold stories on a scatter plot using percentile-derived thresholds and configurable hold rules.

**Independent Test**: Open a synced scope with enough history, verify aging and on-hold stories are highlighted on the scatter plot, filter to flagged work, and inspect lifecycle details for one story.

### Implementation for User Story 2

- [x] T023 [P] [US2] Implement hold-definition persistence and the admin hold-definition route with administrator authorization checks in packages/db/src/repositories/hold-definitions.ts and apps/web/src/app/api/v1/admin/scopes/[scopeId]/hold-definition/route.ts
- [x] T024 [P] [US2] Implement hold-period derivation and percentile aging model builders in apps/worker/src/projections/rebuild-hold-periods.ts and packages/analytics/src/aging-thresholds.ts
- [x] T025 [US2] Enrich current flow projections with on-hold state, aging zones, and low-confidence warnings in apps/worker/src/projections/rebuild-current-flow.ts and packages/db/src/projections/current-work-item-projection.ts
- [x] T026 [US2] Implement authenticated flow analytics and work-item detail APIs, including issue-type, workflow-status, and historical-window filtering, in apps/web/src/app/api/v1/scopes/[scopeId]/flow/route.ts and apps/web/src/app/api/v1/scopes/[scopeId]/items/[workItemId]/route.ts
- [x] T027 [US2] Build the scatter plot, timeframe picker, workflow-status filters, issue-type filters, and analytics view model in apps/web/src/components/flow/aging-scatter-plot.tsx, apps/web/src/components/flow/flow-filters.tsx, and apps/web/src/server/views/flow-analytics.ts
- [x] T028 [US2] Add work-item detail drill-down and hold-definition controls to the scope UI in apps/web/src/components/flow/work-item-detail-drawer.tsx and apps/web/src/app/scopes/[scopeId]/page.tsx
- [x] T029 [P] [US2] Add integration tests for hold derivation, percentile aging, and flow filtering in tests/integration/flow-analytics.integration.test.ts
- [x] T030 [P] [US2] Add end-to-end coverage for the scatter plot, filters, and item drill-down in tests/e2e/flow-analytics.spec.ts

**Checkpoint**: User Stories 1 and 2 should both work independently, with the scope page now exposing actionable aging and on-hold insights.

---

## Phase 5: User Story 3 - Forecast Story Completion (Priority: P3)

**Goal**: Generate story-count throughput views and Monte Carlo forecasts from locally synchronized history.

**Independent Test**: Request both completion-date and completion-volume forecasts for a synced scope and confirm the UI returns story-count ranges, sample sizes, dataVersion metadata, and warnings when confidence is low.

### Implementation for User Story 3

- [x] T031 [P] [US3] Implement completed-story and daily-throughput projection rebuilds in apps/worker/src/projections/rebuild-completed-stories.ts and apps/worker/src/projections/rebuild-daily-throughput.ts
- [x] T032 [P] [US3] Implement story-count Monte Carlo analytics and ForecastResultCache persistence in packages/analytics/src/monte-carlo.ts and packages/db/src/repositories/forecast-result-cache.ts
- [x] T033 [US3] Implement authenticated throughput and forecast API routes in apps/web/src/app/api/v1/scopes/[scopeId]/throughput/route.ts and apps/web/src/app/api/v1/scopes/[scopeId]/forecasts/route.ts
- [x] T034 [US3] Implement forecast response shaping, confidence warnings, and dataVersion pinning in apps/web/src/server/views/forecast-response.ts and packages/shared/src/contracts/forecast.ts
- [x] T035 [US3] Build throughput and forecast UI flows in apps/web/src/app/scopes/[scopeId]/forecast/page.tsx, apps/web/src/components/forecast/throughput-chart.tsx, apps/web/src/components/forecast/forecast-form.tsx, and apps/web/src/components/forecast/forecast-results.tsx
- [x] T036 [P] [US3] Add integration tests for throughput, Monte Carlo sampling, and low-confidence warnings in tests/integration/forecasting.integration.test.ts
- [x] T037 [P] [US3] Add end-to-end coverage for completion-date and completion-volume forecasts in tests/e2e/forecasting.spec.ts

**Checkpoint**: All three user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish documentation, hardening, performance tuning, and end-to-end operator validation across the whole feature.

- [x] T038 [P] Document repository bootstrap and operator workflows in README.md and specs/001-kanban-flow-forecasting/quickstart.md
- [x] T039 Harden PAT redaction, sync error mapping, and stale-connection alerts in packages/shared/src/secrets.ts, apps/web/src/server/services/jira-connections.ts, and apps/worker/src/sync/update-connection-health.ts
- [x] T040 Create projection indexes, tune forecast cache invalidation, and measure flow and forecast latency against the plan thresholds in packages/db/prisma/migrations/20260417_projection_tuning/migration.sql, packages/db/src/projections/current-work-item-projection.ts, and packages/analytics/src/monte-carlo.ts
- [x] T041 [P] Run the quickstart validation flow and capture final developer commands in package.json and specs/001-kanban-flow-forecasting/quickstart.md
- [x] T042 [P] Add performance benchmarks for GET /v1/scopes/{scopeId}/flow, GET /v1/scopes/{scopeId}/items/{workItemId}, and POST /v1/scopes/{scopeId}/forecasts in tests/integration/performance/flow-and-forecast.perf.test.ts
- [x] T043 Wire a test:perf script and document acceptance thresholds in package.json and specs/001-kanban-flow-forecasting/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup** has no dependencies and can start immediately.
- **Phase 2: Foundational** depends on Phase 1 and blocks all story work.
- **Phase 3: User Story 1** depends on Phase 2 and establishes the Jira-backed data pipeline required by the rest of the feature.
- **Phase 4: User Story 2** depends on User Story 1 because aging and hold analytics require synchronized local work-item history.
- **Phase 5: User Story 3** depends on User Story 1 because forecasting requires synchronized completion history, but it can proceed in parallel with User Story 2 once User Story 1 is complete.
- **Phase 6: Polish** depends on the stories selected for release.

### User Story Dependencies

- **US1 (P1)**: Starts after the foundational phase and has no dependency on later stories.
- **US2 (P2)**: Builds on synchronized Jira data and the scope page delivered in US1.
- **US3 (P3)**: Builds on synchronized Jira data from US1 but does not depend on US2.

### Within Each User Story

- Repository and client tasks come before routes.
- Routes come before projections or view shaping that consume them.
- Projection and analytics tasks come before UI tasks that render them.
- Contract, integration, end-to-end, and performance tasks should complete before story or release sign-off.
- Each story should be validated against its independent test before moving to the next priority slice.

### Parallel Opportunities

- **Setup**: T002 and T003 can run in parallel after T001.
- **Foundational**: T005, T006, T007, T009, T010, and T011 can run in parallel after T004.
- **US1**: T012 and T013 can run in parallel before the admin API work begins.
- **US2**: T023 and T024 can run in parallel before the flow projection and API work.
- **US3**: T031 and T032 can run in parallel before the throughput and forecast routes are added.
- **Polish**: T038, T041, and T042 can run in parallel after the release candidate is stable.

---

## Parallel Example: User Story 1

```bash
Task: "Implement Jira connection and flow scope repositories in packages/db/src/repositories/jira-connections.ts and packages/db/src/repositories/flow-scopes.ts"
Task: "Implement Jira PAT validation, board discovery, issue pagination, and changelog retrieval in packages/jira-client/src/client.ts, packages/jira-client/src/discovery.ts, and packages/jira-client/src/issues.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Implement hold-definition persistence and the admin hold-definition route in packages/db/src/repositories/hold-definitions.ts and apps/web/src/app/api/v1/admin/scopes/[scopeId]/hold-definition/route.ts"
Task: "Implement hold-period derivation and percentile aging model builders in apps/worker/src/projections/rebuild-hold-periods.ts and packages/analytics/src/aging-thresholds.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Implement completed-story and daily-throughput projection rebuilds in apps/worker/src/projections/rebuild-completed-stories.ts and apps/worker/src/projections/rebuild-daily-throughput.ts"
Task: "Implement story-count Monte Carlo analytics and ForecastResultCache persistence in packages/analytics/src/monte-carlo.ts and packages/db/src/repositories/forecast-result-cache.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Validate the Jira connection, scope creation, sync, and flow summary as the MVP release slice, including its contract and integration coverage.

### Incremental Delivery

1. Deliver US1 to establish the Jira-backed source of truth and current flow visibility.
2. Add US2 to surface percentile-based aging and on-hold work on the scope page.
3. Add US3 to layer throughput and story-count forecasting on top of the same synchronized dataset.
4. Finish with Phase 6 hardening, performance validation, documentation, and quickstart validation.

### Parallel Team Strategy

1. Have the team complete Setup and Foundational work together.
2. Assign one developer to finish US1 end-to-end because it defines the shared synchronization backbone.
3. After US1 is stable, split work across US2 and US3 in parallel because they use the same synced data but separate analytics and UI components.

---

## Notes

- All checklist items follow the required `- [ ] Txxx [P?] [US?] Description with file path` format.
- Story labels appear only in user-story phases.
- Tasks are written against the planned monorepo structure from plan.md.
- Validation is driven by each story’s independent test criteria plus explicit contract, integration, end-to-end, performance, and final quickstart checks.