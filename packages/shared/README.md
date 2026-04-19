# @agile-tools/shared

## Purpose

`@agile-tools/shared` contains cross-cutting primitives reused across apps and
packages. It currently owns:

- environment configuration parsing
- logging
- secret encryption and redaction helpers
- shared API and forecast contracts

This package is the common language layer for the workspace.

## Architecture

### Main areas

- `src/config.ts`
  Zod-backed environment parsing and cached config access.
- `src/logging.ts`
  Shared logger setup.
- `src/secrets.ts`
  Encryption, decryption, masking, and redaction helpers.
- `src/contracts/`
  Zod schemas and exported types for API request and response payloads.
- `src/index.ts`
  Public export barrel.

### Why this package exists

- Apps should agree on the same environment contract.
- API shapes should be shared instead of redefined in multiple places.
- Sensitive values need one consistent set of helper functions.

## Development

### Common commands

```bash
pnpm --filter @agile-tools/shared build
pnpm --filter @agile-tools/shared typecheck
```

## Development Considerations

- Keep contracts explicit and versionable. If a route changes shape, update the
  schema here first.
- Be mindful of runtime boundaries. Some exports are server-only by nature,
  especially config and secret helpers.
- Do not import secret-handling helpers into client components.
- Changes to `config.ts` affect both web and worker startup, so keep new env
  variables documented and validated.

## When To Change This Package

- Add shared request or response schemas.
- Add configuration values used across modules.
- Add logging or secret-handling helpers.

## When Not To Change This Package

- Do not put app-specific UI types here if they are not shared.
- Do not move heavy business logic here just because multiple modules use it.
- Do not make browser bundles depend on server-only utilities.