# Implementation Plan: Kanban Flow Forecasting

**Branch**: `001-kanban-flow-forecasting` | **Date**: 2026-04-17 | **Spec**: `/specs/001-kanban-flow-forecasting/spec.md`
**Input**: Feature specification from `/specs/001-kanban-flow-forecasting/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a self-hosted internal web application for kanban teams as a TypeScript modular monolith with a Next.js web UI, a dedicated Node worker, and PostgreSQL-backed local Jira read models. The first release focuses on service-account PAT Jira integration, scheduled plus manual synchronization, percentile-based aging detection, explicit on-hold classification, and story-count Monte Carlo forecasts served from local projections instead of live Jira calls.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS  
**Primary Dependencies**: Next.js 16, React 19, Prisma, PostgreSQL 16, pg-boss, Zod, @nivo/scatterplot, @nivo/line, p-retry, p-limit  
**Storage**: PostgreSQL 16 for connection metadata, sync history, normalized Jira data, analytics projections, and forecast cache  
**Testing**: Vitest, Playwright, MSW, Testcontainers  
**Target Platform**: Internal Linux container or VM deployment with network access to self-hosted Jira  
**Project Type**: Web application with separate web and worker deployables in a pnpm workspace monorepo  
**Performance Goals**: Flow and detail reads served from local projections at p95 < 500 ms; forecast responses < 3 s for 10k-20k trials on datasets with at least 60 completed stories  
**Constraints**: Jira Data Center 8.14+ with service-account PAT, scheduled sync every 5-1440 minutes plus manual refresh, one active sync per connection, story-count forecasting only, no live Jira dependency on UI request paths, and reliance on existing workspace authentication for user identity and role context
**Scale/Scope**: Single-tenant internal rollout, one kanban team scope at a time, hundreds of active stories, up to 24 months of history, and low hundreds of thousands of lifecycle events

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Monolith First**: PASS. The plan stays within a pnpm workspace monolith and uses only two deployables that share one codebase and one database.
- **II. Projection-Backed Analytics**: PASS. The design serves flow and forecast views from locally persisted projections rather than live Jira request paths.
- **III. Contract and Schema Discipline**: PASS. The feature has an OpenAPI contract and planned Prisma migrations for schema changes.
- **IV. Test Coverage by Risk**: PASS. The tasks require shared test infrastructure plus contract, integration, end-to-end, and performance validation for the highest-risk areas.
- **V. Operational Safety**: PASS. PAT redaction, single-sync locking, connection health visibility, and stale/unhealthy state handling are included in the design.

## Agent Workflow

- `/speckit.clarify` remains the path for resolving requirement ambiguity before architecture changes are made.
- `/speckit.plan` owns this document and the implementation context shared through `.github/copilot-instructions.md`.
- `/speckit.tasks` owns the executable backlog in `tasks.md`, and `/speckit.analyze` is the mandatory validation step whenever contracts, schemas, projections, sync behavior, or security boundaries change.
- `/speckit.implement` is the default guided implementation path for targeted work inside chat when a human wants tighter control over sequencing.
- `/speckit.ralph.run` is the autonomous implementation path after `tasks.md` is current and consistency analysis is clean. It can be used to work through the backlog in repeated agent iterations.
- `/speckit.ralph.iterate` is the bounded alternative for completing one work unit or one story slice at a time without launching the full loop.
- Optional `speckit.git.commit` hooks may record checkpoints around constitution, planning, tasking, analysis, and implementation, but they do not replace the validation gates required by the constitution.

## Project Structure

### Documentation (this feature)

```text
specs/001-kanban-flow-forecasting/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── kanban-flow-api.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── server/
│   │   │   ├── api/
│   │   │   ├── services/
│   │   │   └── views/
│   │   └── lib/
│   └── tests/
├── worker/
│   ├── src/
│   │   ├── jobs/
│   │   ├── projections/
│   │   ├── sync/
│   │   └── lib/
│   └── tests/
packages/
├── analytics/
│   └── src/
├── db/
│   ├── prisma/
│   └── src/
├── jira-client/
│   └── src/
└── shared/
  └── src/
tests/
├── contract/
├── integration/
└── e2e/
```

**Structure Decision**: Use a small pnpm workspace monorepo with one Next.js web app, one Node worker, and shared TypeScript packages for analytics, database access, Jira integration, and shared types. This keeps deployment simple for v1 while separating request traffic from scheduled sync and projection work.

## Delivery Strategy

Use the current spec, plan, tasks, and analysis artifacts as the source package for agent-driven delivery. Human-guided implementation should use `/speckit.implement` for targeted changes, while the Ralph loop can be used to execute the backlog incrementally once the feature remains constitution-compliant and the task list is stable.

## Complexity Tracking

No constitution violations or extra complexity justifications are currently identified.

## Jira request reduction and resilience (2026-10-18)

Keep the monolith and existing atomic staging/publish flow. A Postgres row and short advisory-locked transactions coordinate header observations, request leases, and burst-free pacing across web and worker processes. Default allocation is half of Jira's advertised refill, with a 20% reserve. A separate renewable connection lease serializes scope syncs. Publication checks and locks the owning connection to fence expired workers.

Cache complete raw issue history and latest comment by connection, issue ID, and Jira updated timestamp. Scan membership each sync, reuse details for unchanged issues, and refresh expired cache entries daily. Inline complete changelogs avoid detail requests; truncated histories fall back to issue endpoints. Keep staged batches when retry time expires and requeue the same run. Resuming scans membership again and skips staged IDs, avoiding fragile offset checkpoints on live Jira ordering.

Constitution check: no new services; analytics still use local versions; migration and OpenAPI accompany settings changes; virtual-clock limiter and real Postgres sync tests cover pacing/persistence; PAT secrecy and scope locking remain required. Request metrics use connection/scope labels; sync_run_id is in structured summaries to avoid an unbounded metric label.
