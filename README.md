# Agile Tools — Kanban Flow Forecasting

An internal web application for kanban teams. Connects to a self-hosted Jira Data Center instance via a service-account PAT, synchronizes issue data on a local PostgreSQL database, and serves flow visibility, aging analysis, and story-count Monte Carlo forecasts entirely from local read models.

## Features

- **Jira sync** — scheduled and manual synchronization of board issues, lifecycle events, and hold periods
- **Current flow view** — scatter plot of active work items with percentile-based aging zones and on-hold classification
- **Work-item detail** — per-item lifecycle timeline and hold period breakdown
- **Monte Carlo forecasting** — story-count "when will we finish?" and "how many by a date?" simulations backed by local throughput history

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22 LTS |
| pnpm | 10+ |
| Docker | any recent version |
| Jira Data Center | 8.14+ |

A Jira service-account PAT with read access to the target board, its issues, and changelog history is required. The PAT is entered through the admin UI and stored encrypted — it is never written to environment files.

## Workspace Layout

```
apps/web        # Next.js UI and HTTP API (port 3000 by default)
apps/worker     # Scheduled sync, manual refresh jobs, projection rebuilds
packages/db     # Prisma schema, migrations, and database helpers
packages/analytics
packages/jira-client
packages/shared
```

## Bootstrap

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create local environment files

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Required variables:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agile_tools
ENCRYPTION_KEY=<32+ character random key — never reuse across environments>
SESSION_SECRET=<32+ character random key>
DEFAULT_SYNC_INTERVAL_MINUTES=10
LOG_LEVEL=debug
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Apply the database schema

```bash
pnpm --filter @agile-tools/db prisma:migrate
```

### 5. Start the web application

```bash
pnpm --filter @agile-tools/web dev
```

### 6. Start the background worker

```bash
pnpm --filter @agile-tools/worker dev
```

Open `http://localhost:3000` and navigate to **Admin → Jira Connections** to configure the first connection.

## Docker Runtime

The repository now ships a single multi-stage Docker image that contains both runtime roles:

- `web` for the Next.js UI and HTTP API
- `worker` for scheduled sync and projection jobs

This is the recommended compromise for this monorepo: build one image artifact, then run separate containers for the web and worker roles. That stays aligned with Docker's one-service-per-container guidance while still keeping artifact management simple.

### Build the image

```bash
docker build -t agile-tools:local .
```

### Run the web role

```bash
docker run --rm -p 3000:3000 --env-file .env \
	-e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/agile_tools \
	agile-tools:local web
```

### Run the worker role

```bash
docker run --rm --env-file .env \
	-e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/agile_tools \
	agile-tools:local worker
```

### Bootstrap database and queue state

```bash
docker run --rm --env-file .env \
	-e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/agile_tools \
	agile-tools:local bootstrap
```

### Run the full runtime stack with Compose

The root compose file keeps `postgres` as the default local dependency and exposes a one-off bootstrap job plus the application runtime containers behind profiles:

```bash
docker compose up -d postgres
docker compose --profile bootstrap run --rm bootstrap
docker compose --profile runtime up --build -d
```

The `bootstrap` role runs Prisma migrations and pg-boss schema migrations from the same image artifact. The image also supports an `all` command for running both processes in one container, but that is a convenience mode rather than the recommended production shape.

## Developer Commands

```bash
# Install all workspace dependencies
pnpm install

# Type-check all packages
pnpm typecheck

# Lint all packages (zero warnings enforced)
pnpm lint

# Run unit tests
pnpm test

# Run contract tests
pnpm test:contract

# Run integration tests (requires Docker for Testcontainers)
pnpm test:integration

# Run end-to-end tests (requires a running web app)
pnpm test:e2e

# Run performance benchmarks (requires Docker for Testcontainers)
pnpm test:perf

# Build all packages
pnpm build
```

## Operator Workflow

See [`specs/001-kanban-flow-forecasting/quickstart.md`](specs/001-kanban-flow-forecasting/quickstart.md) for the full configuration and validation guide, including instructions for creating a Jira connection, defining a flow scope, triggering the first sync, and verifying all three primary user journeys.

## Architecture

See [`specs/001-kanban-flow-forecasting/plan.md`](specs/001-kanban-flow-forecasting/plan.md) for the technical design, data model, and delivery strategy.
