# UI Flows

Use these labels and routes when automating the local Jira and Agile Tools setup flow.

## Local Context Sources

- `.env`
  - `JIRA_PORT`
  - `JIRA_BOOTSTRAP_PUBLIC_BASE_URL`
  - `JIRA_BOOTSTRAP_USERNAME`
  - `JIRA_BOOTSTRAP_PASSWORD`
- `.jira-local/jira-bootstrap.json`
  - `agileToolsConnection.baseUrl`
  - `agileToolsConnection.token`
  - `agileToolsConnection.boardId`
  - `project.key`
  - `board.name`

Prefer the helper script output over raw file reads. In particular:

- `helpers.resetLocalJiraStack` resets the Jira stack and local Agile Tools admin state for a clean rerun.
- `helpers.resolveLatestScopeUrl` resolves the latest created scope URL if the admin-page success link does not navigate.
- `jira.setup.applicationTitle`, `jira.setup.baseUrl`, and `jira.setup.mode` are the preferred wizard defaults.
- `jira.setup.adminDisplayName` and `jira.setup.adminEmail` are the preferred first-admin identity values.
- `jira.setup.licenseKey` is the preferred host product license when present.
- `jira.publicUrl` is the browser-facing Jira URL.
- `agileTools.recommendedJiraBaseUrl` is the URL to store in Agile Tools.
- If Agile Tools is running in Docker and Jira is exposed on localhost, the recommended Agile Tools Jira URL will usually be `http://host.docker.internal:<port>`.

## Jira First-Run Wizard

- Local URL: value from `jira.publicUrl` in the helper script output.
- If `jira.setup.licenseKey` is empty, use Atlassian's public timebomb page and copy the `10 user Jira Software Data Center license, expires in 3 hours` host product key. Atlassian's self-serve Data Center trial path changed on 2026-03-30.
- Wizard values should come from `jira.setup` when those fields exist.
- Keep the default external PostgreSQL path. The local compose stack already wires Jira to `jira-db`.
- Create the first Jira admin with the username and password from the helper script output.

Use the current interactive snapshot instead of hardcoded CSS selectors. The most important labels are usually:

- `Application title`
- `Mode`
- `Base URL`
- `License Key`
- `Full name`
- `Email`
- `Username`
- `Password`
- `Confirm password`

Do not hardcode wizard selectors. Use a fresh interactive snapshot before every step because Atlassian's wizard markup is dynamic across versions.

## Agile Tools Entry Points

- Home page button: `Create local admin session and open Jira setup`
- Auth-required panel button: `Create local admin session and continue →`
- Target admin route: `/admin/jira`
- Page title: `Jira setup`

## Jira Connection Form

- Section title: `Connections`
- Empty-state helper: `No Jira connections configured yet.`
- Form title: `Add Jira Connection`
- Field labels:
  - `Jira Base URL`
  - `Personal Access Token`
  - `Display Name`
- Submit button: `Create Connection`
- Success banner text starts with: `✓ Connection created`
- Validation button: `Validate Connection`
- Healthy validation message: `Connection is healthy.`

Use `agileTools.recommendedJiraBaseUrl` for the `Jira Base URL` field instead of assuming the browser-facing Jira URL is reachable from the Agile Tools runtime.

## Flow Scope Form

- Section title: `Flow scopes`
- Form title: `Create Flow Scope`
- Connection action button: `Discover Boards`
- Board selector label: `Board`
- Board inspection button: `Inspect Board`
- Fieldset legends:
  - `Start Statuses`
  - `Done Statuses`
  - `Issue Types`
- Field labels:
  - `Timezone`
  - `Sync Interval`
- Submit button: `Create Flow Scope`
- Success banner text starts with: `✓ Flow scope created`
- Success link text: `View Scope →`

## Default Scope Selections For Seeded Local Jira

Use the bootstrap summary when available.

- Preferred board name: `bootstrap.board.name`
- Preferred board id: `bootstrap.agileToolsConnection.boardId`
- Preferred start statuses, in order:
  - `Selected for Development`
  - `In Progress`
  - `Doing`
  - `Development`
- Preferred done statuses, in order:
  - `Done`
  - `Closed`
  - `Resolved`
- Issue types: select all visible issue types unless the user requests a narrower scope.
- Timezone: `UTC`
- Sync interval: `5`

If checkbox clicks do not stick in the scope form, use keyboard activation instead:

1. `focus @eN`
2. `press Space`

If the board exposes an off-board completion status such as `Closed (off-board)`, include it in done statuses only when the user wants off-board completion tracking.

If clicking `View Scope →` does not navigate, run the scope URL helper command from local context and open the returned `url` directly.