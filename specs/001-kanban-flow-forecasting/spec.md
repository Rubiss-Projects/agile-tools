# Feature Specification: Kanban Flow Forecasting

**Feature Branch**: `001-kanban-flow-forecasting`  
**Created**: 2026-04-17  
**Status**: Draft  
**Input**: User description: "I want to build agile tools to support kanban teams. This should support scatter plots to reveal aging stories, stories on hold, etc. I also want this to support monte carlo simulations to estimate story completion / forecasts. We use JIRA, so first pass should include a direct integration with JIRA."

## Clarifications

### Session 2026-04-17

- Q: What Jira deployment and credential model should v1 support? → A: Self-hosted Jira with a service-account PAT.
- Q: How should v1 determine that a story is on hold? → A: Administrators map one or more hold statuses and can optionally include a blocked flag.
- Q: What forecasting unit should v1 use for Monte Carlo simulation? → A: Completed story count only.
- Q: What sync model should v1 use for Jira data? → A: Scheduled background sync plus manual refresh.
- Q: How should v1 determine that a story is aging? → A: Derive aging thresholds automatically from historical cycle-time percentiles.

## Delivery Workflow Notes

- This feature is governed through the Speckit workflow: `/speckit.specify` and `/speckit.clarify` maintain the feature definition, `/speckit.plan` and `/speckit.tasks` maintain implementation design and backlog, and `/speckit.analyze` is the consistency gate before implementation proceeds.
- Implementation can proceed through bounded in-chat execution with `/speckit.implement` or through the autonomous Ralph loop with `/speckit.ralph.run` after the constitution gates, task breakdown, and consistency analysis are current.
- `/speckit.ralph.iterate` is the preferred agent path when the team wants a single work unit completed without launching the full Ralph loop.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Self-Hosted Jira and See Team Flow (Priority: P1)

As a delivery manager for a kanban team, I want our workspace administrator to connect our self-hosted Jira board once and keep it synced so that analytics are based on current work rather than exported spreadsheets.

**Why this priority**: Direct Jira connectivity is the foundation for every other capability. Without trusted source data, the visual analysis and forecasts are not usable.

**Independent Test**: Can be fully tested by configuring a self-hosted Jira board with a service-account PAT, running an initial sync, and confirming the system produces a usable flow view without manual data preparation.

**Acceptance Scenarios**:

1. **Given** a workspace administrator has a service-account PAT for the team's self-hosted Jira instance, **When** they configure that board connection and the sync completes, **Then** the system shows a flow view built from the board's current and recent story data.
2. **Given** a configured self-hosted Jira board has changed since the last sync, **When** the scheduled background sync runs or an authorized user triggers a manual refresh, **Then** the flow view reflects updated stories, statuses, and ages.

---

### User Story 2 - Reveal Aging and On-Hold Stories (Priority: P2)

As a team lead, I want a scatter plot that highlights aging stories using percentile-based flow expectations and shows stories on hold so that I can quickly identify stalled work and intervene before delivery risk increases.

**Why this priority**: Teams get immediate operational value from seeing flow problems clearly, even before they begin using forecasts for planning.

**Independent Test**: Can be fully tested by opening the scatter plot for a synced board with enough history to derive percentile-based aging thresholds, applying aging or hold-state filters, and confirming that stalled stories are visually highlighted and reviewable.

**Acceptance Scenarios**:

1. **Given** a board contains stories with different ages and hold states, **When** the user opens the scatter plot, **Then** aging outliers determined from historical cycle-time percentiles and on-hold stories are visibly distinguished from normally flowing work.
2. **Given** the scatter plot contains flagged stories, **When** the user filters to aging or on-hold work, **Then** only matching stories remain visible and each can be reviewed individually.

---

### User Story 3 - Forecast Story Completion (Priority: P3)

As a delivery manager, I want completed-story throughput and Monte Carlo forecasts based on completed story count for a remaining story count or target date so that I can communicate likely completion outcomes with clearer ranges instead of a single guess.

**Why this priority**: Forecasting turns historical team performance into planning support, but it depends on the data and visibility delivered by the higher-priority stories.

**Independent Test**: Can be fully tested by selecting a synced team dataset with enough historical story completions, reviewing the completed-story throughput view for the chosen historical window, running a forecast for a remaining story count or target date, and verifying that the system returns probability-based completion ranges.

**Acceptance Scenarios**:

1. **Given** sufficient historical story completion data and a chosen remaining story count, **When** the user runs a forecast, **Then** the system returns likely completion date ranges at multiple confidence levels.
2. **Given** sufficient historical story completion data and a target date, **When** the user runs a forecast, **Then** the system returns likely story-count completion ranges by that date at multiple confidence levels.
3. **Given** sufficient historical story completion data and a selected historical window, **When** the user opens the forecast workflow, **Then** the system shows the completed-story throughput used to interpret the forecast.

---

### Edge Cases

- A newly connected Jira board has too little historical completion data to generate a reliable forecast.
- A board has too little relevant historical cycle-time data to derive stable aging thresholds for one or more workflow stages.
- Stories move in and out of admin-mapped hold states multiple times, use the blocked flag inconsistently, or skip expected workflow states.
- The Jira board includes issue types that should not be part of team flow analysis, such as parent items or administrative work.
- Access to Jira is interrupted or board configuration changes during a scheduled or manual refresh, resulting in partial or outdated source data.
- A user triggers a manual refresh while a sync for the same flow scope is already queued or running.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an authorized administrator to configure a connection to a self-hosted Jira source using a service-account PAT and select the board or workflow scope to analyze.
- **FR-002**: The system MUST import the current state and sufficient historical status changes for selected stories to calculate age, time on hold, and completion history.
- **FR-003**: The system MUST provide a refreshable analytics view built from locally persisted Jira-derived projections without requiring manual data export or spreadsheet preparation.
- **FR-004**: The system MUST support scheduled background sync for each configured flow scope and allow authorized users to trigger a manual refresh on demand.
- **FR-005**: The system MUST present a scatter plot of individual stories that makes aging work and overall flow distribution visible at a glance.
- **FR-006**: The system MUST derive aging thresholds automatically from historical cycle-time percentiles in the selected team data and visually distinguish stories that exceed those thresholds from stories that remain within expected flow.
- **FR-007**: The system MUST let an authorized administrator map one or more Jira workflow statuses as hold states and optionally include a blocked flag in the on-hold definition.
- **FR-008**: The system MUST identify stories currently on hold and stories that have spent time on hold according to the configured hold definition, and allow users to isolate them in the view.
- **FR-009**: The system MUST let users inspect story details from plotted or flagged items, including story identifier, summary, current state, age, and hold-related context.
- **FR-010**: The system MUST allow users to filter analytics by historical window, workflow status, and issue type scope relevant to the kanban team.
- **FR-011**: The system MUST generate Monte Carlo forecasts using historical story-completion behavior from the selected team data.
- **FR-012**: The system MUST support forecasting for both likely completion dates from a remaining story count and likely story-count completion volume by a target date.
- **FR-013**: The system MUST present forecast outputs as probability ranges at multiple confidence levels and state the historical period used for the forecast, using date ranges for completion-date forecasts and story-count ranges for target-date forecasts.
- **FR-014**: The system MUST warn users when forecast results are unavailable or low-confidence because source data is insufficient, incomplete, or unusually volatile.
- **FR-015**: The system MUST validate the configured self-hosted Jira PAT before the first sync and show administrators connection or permission failures without exposing the token value.
- **FR-016**: The system MUST preserve the configured hold mapping used to classify stories so subsequent syncs and flow analytics apply the same definition until an administrator changes it.
- **FR-017**: The system MUST show when the most recent scheduled or manual sync completed and whether the current Jira connection is healthy.
- **FR-018**: The system MUST present completed-story throughput for the selected historical window so users can interpret the dataset underlying the forecast.
- **FR-019**: The system MUST rely on the existing workspace authentication context to distinguish administrators from general users and restrict connection, scope, and hold-definition management to administrators.
- **FR-020**: The system MUST reject unauthenticated or unauthorized requests with explicit authentication or permission errors.

### Key Entities *(include if feature involves data)*

- **Jira Connection**: An administrator-managed link to a self-hosted Jira instance, including the service-account credential and current connection health state.
- **Flow Scope**: The selected Jira board and analysis boundaries, including included issue types, start and done statuses, timezone, and sync cadence.
- **Story Record**: A kanban work item with identity, summary, issue type, current state, age, hold periods, and completion history.
- **Aging Threshold Model**: The percentile-based cycle-time thresholds derived from historical team data and used to classify stories as aging.
- **Hold Definition**: The administrator-managed combination of Jira statuses and optional blocked-flag logic used to classify stories as on hold.
- **Flow View**: A team-specific analytics view containing selected filters, aging threshold model, hold definition, and the visible set of stories.
- **Forecast Request**: A user-defined forecasting question based on a remaining story count or target date and the chosen historical window.
- **Forecast Result**: A probability-based forecast range whose unit depends on forecast type, using completion dates for `when` forecasts and story-count ranges for `how_many` forecasts, with confidence levels and explanatory notes about data quality.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect a Jira board and produce an initial flow view in under 15 minutes without exporting data to another tool.
- **SC-002**: In usability review, at least 90% of users can identify which stories are aging under the percentile-based threshold model or on hold within 2 minutes of opening the scatter plot.
- **SC-003**: For datasets with at least 60 completed stories in the selected historical window, story-count forecast results are produced in under 3 seconds after the user selects a scope or target date.
- **SC-004**: Over a 3-month pilot, at least 70% of forecast ranges chosen by teams contain the actual completion outcome.
- **SC-005**: Teams using the feature reduce manual status-report preparation time by at least 50% compared with their current Jira-only reporting process.

## Assumptions

- Initial users are delivery managers, team leads, and similar roles who are approved to view team delivery data in this tool.
- The first release focuses on one kanban team view at a time, even if the underlying Jira board contains multiple columns or issue types.
- A workspace administrator can provision and rotate a service-account PAT with sufficient read access to the self-hosted Jira data needed by the tool.
- Self-hosted Jira is the only external work-management source in scope for the first release.
- The application receives user identity and administrator-versus-viewer role context from an existing workspace authentication system.
- Aging detection relies on enough historical cycle-time data being available to derive meaningful percentile-based thresholds for the selected team data.
- Forecasting relies on the team's own historical story completions rather than story points, manual point estimates, or external capacity-planning inputs.
- The team will keep the spec, plan, tasks, and analysis artifacts synchronized through the Speckit command workflow before autonomous implementation is delegated to Ralph.
- Mobile-specific workflows, portfolio rollups, and cross-team forecasting are out of scope for the first release.