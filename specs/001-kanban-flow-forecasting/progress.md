# Ralph Progress Log

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

