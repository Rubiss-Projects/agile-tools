# Contributing

Thanks for contributing to Agile Tools.

This repository is a pnpm workspace monorepo for a self-hosted Jira Data Center kanban flow forecasting application. The project values focused changes, clear validation, and explicit updates to contracts, schemas, and documentation when behavior changes.

## Before You Start

- Search existing issues and discussions before opening a new thread.
- Use GitHub Discussions for questions, design exploration, and early proposals.
- Open or discuss larger changes before starting implementation so direction can be aligned early.
- By participating in this repository, you agree to follow the code of conduct in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Local Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and fill in local development values.
3. Start PostgreSQL with `docker compose up -d postgres`.
4. Apply database migrations with `pnpm --filter @agile-tools/db prisma:migrate`.
5. Start the app processes you need:
   - `pnpm --filter @agile-tools/web dev`
   - `pnpm --filter @agile-tools/worker dev`

## Tooling Requirements

- Node.js 22 LTS
- pnpm 10+
- Docker for local PostgreSQL and integration or performance test flows

## What Good Contributions Look Like

- Keep changes narrow and reviewable.
- Preserve existing architecture and naming unless the change explicitly requires otherwise.
- Update OpenAPI, Prisma migrations, specs, or operator docs when routes, schemas, workflows, or configuration change.
- Add or update tests for the behavior you changed.
- Never commit secrets, production credentials, Jira PATs, or real customer data.

## Validation Expectations

Run the baseline checks before opening a pull request:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Run additional suites when relevant:

- `pnpm test:contract` for API, schema, or contract changes
- `pnpm test:integration` for sync, projections, queues, or database behavior
- `pnpm test:e2e` for user-facing workflow changes
- `pnpm test:perf` when forecast or flow performance may be affected

## Pull Request Expectations

- Explain the problem being solved and the chosen approach.
- List the validation commands you ran and any important limitations.
- Include screenshots or recordings for meaningful UI changes.
- Call out security, migration, contract, or operational impact explicitly.
- Update documentation in the same pull request when behavior, setup, or deployment changes.

## Review Notes

- Prefer small pull requests over broad refactors.
- Expect review feedback to focus on correctness, test coverage, operational safety, and API or schema discipline.
- Follow-up cleanup is fine, but shipping behavior without the necessary validation or docs is not.