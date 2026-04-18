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

