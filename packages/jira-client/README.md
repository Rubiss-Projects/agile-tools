# @agile-tools/jira-client

## Purpose

`@agile-tools/jira-client` isolates all Jira Data Center HTTP integration.
It provides a small, typed client plus higher-level helpers for board discovery,
issue pagination, and changelog retrieval.

This package should know Jira's HTTP shape, but it should not know the local
database schema or web framework.

## Architecture

### Files

- `src/client.ts`
  Base HTTP client, PAT authentication, retry behavior, rate-limit handling,
  and connection validation.
- `src/discovery.ts`
  Board listing and board metadata inspection used during scope setup.
- `src/issues.ts`
  Board issue pagination, async streaming, and full changelog retrieval.
- `src/index.ts`
  Public export surface.

### Behavioral responsibilities

- Normalize base URLs.
- Retry transient failures.
- Abort immediately on unrecoverable auth and not-found errors.
- Enforce a small concurrency limit to avoid hammering Jira.

## Development

### Common commands

```bash
pnpm --filter @agile-tools/jira-client build
pnpm --filter @agile-tools/jira-client typecheck
```

## Development Considerations

- Keep this package focused on HTTP translation and Jira-specific data shapes.
- Prefer adding typed interfaces for Jira responses here instead of leaking raw
  `unknown` payloads upward.
- Use `fetchIssueChangelog()` for authoritative lifecycle history. Inline
  changelog expansions on issue search results are opportunistic and may be
  truncated.
- Keep retry policy conservative. Jira is an external dependency and backoff
  behavior affects both correctness and operator trust.
- Do not let database or application-specific business rules creep into this
  package.

## When To Change This Package

- Add Jira API endpoints.
- Adjust retry, concurrency, or error normalization behavior.
- Add response typing or discovery helpers.

## When Not To Change This Package

- Do not persist data here.
- Do not calculate projections here.
- Do not shape browser-specific API responses here.