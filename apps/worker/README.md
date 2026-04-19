# @agile-tools/worker

## Purpose

`@agile-tools/worker` is the background process for scheduled and manual syncs.
It owns queue consumers, Jira synchronization, projection rebuilds, and the
operational lifecycle of the worker runtime.

If work is long-running, scheduled, retryable, or projection-oriented, it
probably belongs here rather than in the web process.

## Architecture

### Main areas

- `src/index.ts`
  Process entrypoint and graceful shutdown wiring.
- `src/lib/`
  Worker bootstrap and queue lifecycle.
- `src/jobs/`
  pg-boss job registration and recurring dispatch logic.
- `src/sync/`
  Scope synchronization pipeline and Jira ingestion behavior.
- `src/projections/`
  Projection rebuild logic for throughput, aging, flow, hold periods, and scope
  summary state.

### Runtime model

- The worker connects to PostgreSQL through the shared Prisma client.
- pg-boss uses the same PostgreSQL instance as the queue backend.
- Job handlers create or reuse `SyncRun` records and then execute the sync
  pipeline.
- Projection updates happen inside the worker so the web app can read from
  prepared local state.

## Development

### Common commands

```bash
pnpm --filter @agile-tools/worker dev
pnpm --filter @agile-tools/worker build
pnpm --filter @agile-tools/worker typecheck
pnpm --filter @agile-tools/worker lint
```

### Operational assumptions

- The worker expects the same root `.env` as the web app.
- PostgreSQL must be available before queue initialization succeeds.
- Queue names need to be created before workers or schedules are registered.

## Development Considerations

- Keep one clear boundary: the worker performs writes, sync, and rebuild work;
  the web app reads and triggers.
- Preserve graceful shutdown behavior. This process is expected to stop cleanly
  on `SIGTERM` and `SIGINT`.
- Treat queue job payloads as durable contracts. Small shape changes can break
  jobs already persisted in pg-boss.
- If a new task can be derived from projections rather than a live Jira request,
  prefer the projection-backed path.
- Keep logging structured and high-signal. Queue and sync failures need to be
  diagnosable from logs alone.

## When To Change This App

- Add background jobs.
- Adjust scheduling cadence or dispatch behavior.
- Change how sync runs or projections are executed.
- Add retry, concurrency, or shutdown behavior for background work.

## When Not To Change This App

- Do not move browser-facing request logic here.
- Do not implement pure analytics formulas here if they can stay in
  `@agile-tools/analytics`.
- Do not duplicate repository logic that belongs in `@agile-tools/db`.