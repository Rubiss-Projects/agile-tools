<!--
Sync Impact Report
Version change: 1.0.0 -> 1.1.0
Modified principles:
- I. Modular Monolith First -> I. Modular Monolith First
- II. Projection-Backed Analytics -> II. Projection-Backed Analytics
- III. Contract and Schema Discipline -> III. Contract and Schema Discipline
- IV. Test Coverage by Risk -> IV. Test Coverage by Risk
- V. Operational Safety -> V. Operational Safety
Added sections:
- None
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ .github/copilot-instructions.md
Follow-up TODOs:
- None
-->
# Agile Tools Constitution

## Core Principles

### I. Modular Monolith First
Features MUST ship inside the workspace monolith by default. New deployables or services require a written justification tied to scaling, isolation, or operational constraints that cannot be met inside the monolith. This preserves delivery speed while the product’s core workflows and boundaries are still evolving.

### II. Projection-Backed Analytics
User-facing analytics MUST read from locally persisted projections or read models derived from synchronized source data. Live Jira requests MAY be used for connection validation and source discovery, but MUST NOT sit on the request path for analytics or forecasting. This keeps the product responsive and resilient when Jira is slow, unavailable, or partially inconsistent.

### III. Contract and Schema Discipline
HTTP routes MUST be represented in OpenAPI and backed by typed request and response schemas. Database changes MUST ship with explicit migrations and compatibility considerations. This keeps interfaces reviewable, testable, and reproducible across environments.

### IV. Test Coverage by Risk
Analytics logic MUST have unit or integration coverage. Jira sync, persistence, and projection code MUST have integration coverage. Each shipped user story MUST have end-to-end validation of its primary journey, and performance-sensitive features MUST have benchmark or threshold validation when the plan defines latency goals. This ensures the highest-risk behavior is verified at the right level.

### V. Operational Safety
PAT values MUST be write-only secrets and MUST NOT be logged or returned. Only one sync MAY run per scope at a time. Authentication failures, authorization failures, and unhealthy or stale Jira connections MUST be visible to operators and users through explicit system states. This reduces data corruption risk and keeps operational failures diagnosable.

## Additional Constraints

- The first release targets self-hosted Jira Data Center with a service-account PAT.
- Forecasting uses story-count sampling as the planning basis; forecast outputs may be dates or story counts depending on forecast type.
- Scheduled sync plus manual refresh is the supported ingestion model for v1.
- The application reuses an existing workspace authentication context for user identity and role enforcement.

## Development Workflow

- Spec, plan, tasks, and analysis MUST exist before implementation begins.
- Every implementation plan MUST include a Constitution Check that evaluates each core principle explicitly.
- Changes to contracts, schemas, projections, sync behavior, or security boundaries MUST trigger a fresh consistency analysis before implementation continues.
- Tasks MUST include the validation work required by this constitution, not just implementation work.
- Quickstart and operator-facing documentation MUST be updated when behavior, configuration, or validation flows change.

## Governance

This constitution supersedes conflicting local habits or undocumented process.

- Amendment procedure: update this file, update any affected templates or runtime guidance in the same branch, and prepend a new Sync Impact Report describing the version bump and propagation work.
- Versioning policy: MAJOR for incompatible governance changes or principle removals, MINOR for new principles or materially expanded guidance, PATCH for clarifications and wording-only refinements.
- Compliance review expectations: plans MUST document constitution compliance, tasks MUST carry required validation coverage, and reviews MUST verify contracts, migrations, tests, security handling, and performance validation when affected.

**Version**: 1.1.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-04-17
