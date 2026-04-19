# @agile-tools/analytics

## Purpose

`@agile-tools/analytics` contains pure domain calculations used by the product.
Today that mainly means:

- percentile-based aging thresholds
- work-item aging classification
- Monte Carlo forecasting for "when" and "how many" questions

This package should stay free of database, queue, HTTP, and framework concerns.

## Architecture

### Files

- `src/aging-thresholds.ts`
  Builds p50, p70, and p85 cycle-time thresholds and classifies aging zones.
- `src/monte-carlo.ts`
  Runs story-count Monte Carlo simulations and emits warnings for low-sample or
  zero-throughput cases.
- `src/index.ts`
  Public export surface.

### Design principles

- Input data should be plain objects and arrays.
- Output data should be serializable and contract-friendly.
- All product-specific thresholds should live in code close to the relevant
  algorithm.

## Development

### Common commands

```bash
pnpm --filter @agile-tools/analytics build
pnpm --filter @agile-tools/analytics typecheck
```

## Development Considerations

- Keep functions deterministic where practical and easy to test with fixed
  inputs.
- Avoid importing Prisma, Next.js, pg-boss, or network code here.
- If you add a new analytics concept, define the domain vocabulary and warning
  semantics here before wiring it into routes or projections.
- Forecast warnings are part of product behavior, not just implementation
  detail. Changes to thresholds like minimum sample size affect user trust and
  should be made deliberately.

## When To Change This Package

- Add new analytics formulas.
- Change percentile logic or simulation behavior.
- Introduce new warning rules or shared math helpers.

## When Not To Change This Package

- Do not embed persistence concerns here.
- Do not shape web responses here.
- Do not put Jira normalization logic here.