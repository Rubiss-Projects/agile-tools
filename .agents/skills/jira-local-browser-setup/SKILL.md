---
name: jira-local-browser-setup
description: Automate the local Jira Data Center first-run wizard and the Agile Tools admin browser setup flow for this repository. Use when working in agile-tools and the user wants an agent to drive browser steps for local Jira setup, finish the first-run Jira wizard, create a local admin session in Agile Tools, create or validate a Jira connection, discover a board, inspect it, and create a flow scope from the seeded local Jira data.
---

# Jira Local Browser Setup

Automate the local Jira and Agile Tools browser workflow for this repository.

## Overview

Use this sequence:

1. If the user wants a clean rerun from scratch, run `node docker/reset-local-jira-stack.mjs` from the repo root.
2. Read local setup context with `node .agents/skills/jira-local-browser-setup/scripts/read-local-context.mjs`.
3. Read `references/ui-flows.md` for the exact labels, routes, helper commands, and selection defaults.
4. Before the first `agent-browser` command, load the current CLI workflow guide with `agent-browser skills get core`.
5. Use `agent-browser` in a headed named session for the Jira wizard.
6. After the Jira wizard finishes, run `docker compose -f docker-compose.jira.yml --profile bootstrap run --rm jira-bootstrap` from the repo root.
7. Re-read local setup context so the generated PAT and board metadata are available.
8. Use `agent-browser` in a headed named session for the Agile Tools admin flow.

## Required Local Inputs

Collect runtime values from the helper script instead of re-parsing files manually.

The script reads:

- `.env` for `JIRA_PORT`, `JIRA_BOOTSTRAP_PUBLIC_BASE_URL`, `JIRA_BOOTSTRAP_USERNAME`, and `JIRA_BOOTSTRAP_PASSWORD`
- `.jira-local/jira-bootstrap.json` when the Jira bootstrap step has already run

The helper output also reports the recommended Jira base URL for Agile Tools. When the web app is running in Docker, that value can differ from the browser-facing Jira URL and will usually be `http://host.docker.internal:<port>`.

The helper output also reports:

- `helpers.resetLocalJiraStack` for a clean Jira reset
- `helpers.resolveLatestScopeUrl` for the fallback scope-page URL lookup
- `jira.setup.*` for the wizard defaults
- `localAdmin.workspaceId` for the local Agile Tools bootstrap workspace

If the helper script reports missing Jira admin credentials, stop and ask the user to populate `.env` before trying browser automation.

## Browser Automation Rules

- Load the current CLI instructions with `agent-browser skills get core` before using other `agent-browser` commands.
- Prefer `agent-browser --headed --session <name>` so the user can see the flow.
- Run `agent-browser --session <name> snapshot --interactive --compact` after each page load and before any destructive submit.
- Prefer stable text and label targets from `references/ui-flows.md`.
- When labels drift, use the current snapshot refs (`@eN`) instead of guessing CSS selectors.
- Keep Jira and Agile Tools in separate sessions so cookies do not interfere.

## Jira Wizard Workflow

Use session name `jira-local-setup`.

1. Open the local Jira URL from the helper script.
2. If the Jira wizard is already complete, skip to the bootstrap compose step.
3. Use the wizard defaults from `jira.setup` for application title, mode, base URL, display name, and admin email.
4. If `jira.setup.licenseKey` is empty, open Atlassian's public timebomb page in a second tab and copy the `10 user Jira Software Data Center license, expires in 3 hours` host product key. Atlassian's self-serve Data Center trial flow changed after 2026-03-30, so do not assume the old evaluation-license path still works.
5. Keep the default external PostgreSQL path; the compose file already points Jira at `jira-db`.
6. Create the first Jira admin with the username and password reported by the helper script.
7. Wait until the wizard lands on the Jira application home page or another authenticated Jira page.

After the wizard completes, leave the browser session intact and run the Jira bootstrap compose command from the terminal.

## Agile Tools Workflow

Use session name `agile-tools-jira-setup`.

1. Open the Agile Tools base URL from the helper script.
2. If a workspace session is missing, click the local bootstrap button that leads to `/admin/jira`.
3. On the Jira setup page, create the Jira connection from the bootstrap summary:
   - Jira Base URL: `agileTools.recommendedJiraBaseUrl`
   - Personal Access Token: `bootstrap.agileToolsConnection.token`
   - Display Name: `Local Jira (<projectKey>)`
4. Click `Create Connection`, then `Validate Connection`.
5. Wait for the healthy validation pill.
6. Create the flow scope using the seeded board metadata and the defaults in `references/ui-flows.md`.
7. If checkbox clicks do not persist in the flow scope form, switch to `focus <ref>` followed by `press Space` for those checkboxes.
8. If clicking `View Scope` does not navigate, run `node .agents/skills/jira-local-browser-setup/scripts/resolve-local-scope-url.mjs` and open the returned `url` directly.

## Flow Scope Defaults

Use these defaults unless the user asked for different flow semantics:

- Select the seeded board from the bootstrap summary, otherwise the first discovered board.
- Include every visible issue type.
- Prefer `Selected for Development`, `In Progress`, or `Doing` as start statuses.
- Prefer `Done`, `Closed`, or `Resolved` as done statuses.
- Use `UTC` timezone.
- Use `5` minute sync interval.

If the seeded workflow exposes only one obvious in-progress status and one obvious done status, use those.

## Validation

After the browser flow finishes:

1. Confirm the Jira connection shows a healthy validation pill.
2. Confirm the flow scope success banner appears.
3. If a scope was created, open the scope page from the success link.
4. If the success link is flaky, use the scope URL helper and confirm the returned scope page loads.

## Recovery

- If you need to restart the whole local Jira test bed from a blank state, run `node docker/reset-local-jira-stack.mjs`.
- If the Jira bootstrap summary is missing after the wizard, rerun `docker compose -f docker-compose.jira.yml --profile bootstrap run --rm jira-bootstrap`.
- If the PAT is stale, rerun the same bootstrap command and refresh local context.
- If the Agile Tools admin page shows an auth-required panel again, re-click the local admin bootstrap button and continue to `/admin/jira`.