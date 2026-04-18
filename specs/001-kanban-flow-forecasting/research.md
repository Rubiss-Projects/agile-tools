# Research: Kanban Flow Forecasting

## Decision 1: Use a TypeScript modular monolith with separate web and worker deployables

- **Decision**: Build the product as a pnpm workspace monorepo with a Next.js web application, a separate Node worker process, and shared TypeScript packages for analytics, persistence, and Jira integration.
- **Rationale**: One language across UI, API, worker, and analytics keeps implementation speed high and operational complexity low. A dedicated worker isolates scheduled Jira syncs and projection rebuilding from user-facing request latency while preserving a straightforward deployment model.
- **Alternatives considered**: A split SPA plus API stack was rejected because it adds service boundaries without helping v1 delivery. A microservice design was rejected because sync, analytics, and UI traffic do not yet justify multiple independently deployed services. A Python analytics sidecar was rejected because Monte Carlo story-count forecasts and percentile calculations are simple enough to keep in TypeScript for v1.

## Decision 2: Persist Jira data locally in PostgreSQL and serve analytics from local projections

- **Decision**: Store normalized Jira issues, lifecycle events, hold periods, sync runs, and derived read models in PostgreSQL 16, accessed through Prisma.
- **Rationale**: The UI must stay responsive even when Jira is slow or unavailable. Local projections support fast flow views, deterministic forecasts, stable `dataVersion` snapshots across widgets, and clean handling of scheduled sync plus manual refresh.
- **Alternatives considered**: A live Jira proxy was rejected because it would push Jira latency, rate limits, and intermittent failures directly into every user interaction. A document store was rejected because the data has clear relational structure and benefits from SQL aggregation for projections. In-memory-only caching was rejected because analytics must survive process restarts and support repeatable reads.

## Decision 3: Use a thin internal Jira Data Center client with PAT auth, retries, and bounded concurrency

- **Decision**: Implement Jira access through a focused internal client built on `fetch`, `p-retry`, and `p-limit`, using bearer PAT authentication against self-hosted Jira Data Center REST endpoints.
- **Rationale**: The Jira integration needs tight control over pagination, changelog expansion, retry policy, and failure handling. A thin internal client keeps the dependency surface small while matching the exact data needed for board discovery, lifecycle history, and health validation.
- **Alternatives considered**: Generated Jira SDKs were rejected for v1 because they add maintenance overhead without reducing the complexity of the custom normalization rules. Webhook-first ingestion was rejected because the clarified spec already chooses scheduled sync plus manual refresh. Building a Jira plugin was rejected because the product is a standalone internal tool rather than an in-Jira extension.

## Decision 4: Use `pg-boss` for scheduling and background job orchestration

- **Decision**: Schedule recurring sync work and process manual refresh requests through `pg-boss`, backed by the same PostgreSQL instance as the rest of the application.
- **Rationale**: The feature needs durable scheduled jobs, manual refresh queueing, retries, and single-run coordination per scope. `pg-boss` provides those capabilities without introducing a second stateful runtime beyond PostgreSQL.
- **Alternatives considered**: `node-cron` alone was rejected because it does not provide durable job state or safe coordination for overlapping manual and scheduled runs. BullMQ was rejected because it would require Redis just to support a modest v1 job graph. Temporal was rejected because workflow orchestration is unnecessary overhead for a single sync-and-project pipeline.

## Decision 5: Use Nivo for charts and implement analytics directly over local projections

- **Decision**: Render scatter, throughput, and forecast visuals with Nivo components and compute percentile aging thresholds plus story-count Monte Carlo forecasts in shared analytics modules.
- **Rationale**: Nivo supports interactive React charts with a small enough surface for a focused internal tool. The statistical requirements are modest, so keeping analytics in application code avoids another runtime or service boundary while staying transparent and testable.
- **Alternatives considered**: Heavier charting frameworks were rejected because the current feature set only needs scatter, line, and bar visuals. A dedicated statistics service was rejected because percentile calculations and Monte Carlo trials do not require specialized infrastructure at this scale.

## Decision 6: Test with Vitest, Playwright, MSW, Testcontainers, and golden datasets

- **Decision**: Use Vitest for unit and service tests, Playwright for end-to-end user flows, MSW for deterministic Jira API mocks, and Testcontainers for PostgreSQL-backed integration and contract tests.
- **Rationale**: The feature depends on precise lifecycle normalization and data-quality handling. Golden datasets for reopened items, multiple hold periods, sparse history, and timezone boundaries will catch regressions better than shallow endpoint tests alone.
- **Alternatives considered**: Browser-only smoke tests were rejected because they would not validate Jira normalization or forecast correctness. Pure unit tests were rejected because sync, projections, and database-backed projections are central to the product's behavior.

## Decision 7: Enforce explicit data-quality thresholds and degrade visibly when history is insufficient

- **Decision**: Treat aging thresholds as low confidence below roughly 30 completed stories and forecasts as low confidence or unavailable below 60 completed stories, surfacing warnings in every affected response.
- **Rationale**: The clarified spec requires warnings for incomplete or volatile data. Baking thresholds into the design prevents misleading charts and keeps forecasting quality explicit for teams with sparse history.
- **Alternatives considered**: Always returning a chart or forecast regardless of sample size was rejected because it would overstate confidence. Hard-failing all analytics on any data gap was rejected because flow visibility should remain available even when forecast confidence is low.