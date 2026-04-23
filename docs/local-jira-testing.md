# Local Jira Testing

Use [docker-compose.jira.yml](../docker-compose.jira.yml) when you want a real Jira target for manual Agile Tools smoke testing. This stack is intentionally isolated from the main [docker-compose.yml](../docker-compose.yml) runtime and is not part of the normal automated test path.

The setup assumes a single-node Jira Data Center instance with a separate PostgreSQL database. Atlassian documents single-node Data Center as a supported local shape, and PATs are supported in Jira Software 8.14 and later.

## Start The Stack

```bash
docker compose -f docker-compose.jira.yml up -d
docker compose -f docker-compose.jira.yml logs -f jira
```

Defaults:

- Jira UI: `http://localhost:8080` unless `JIRA_PORT` overrides it
- Jira DB: internal to the compose network only
- Jira image tag: `atlassian/jira-software:9.12`

The first startup can take several minutes while Jira initializes and writes its home directory.

## Reset From Scratch

Reset the local Jira stack, remove its database and home volumes, clear generated bootstrap output, and reset the local Agile Tools admin workspace:

```bash
node docker/reset-local-jira-stack.mjs
```

Add `--no-start` if you want the stack left stopped after the reset.

## First-Time Jira Setup

You can complete the Jira setup wizard manually in the browser, or let the repo-local `jira-local-browser-setup` skill drive it for you.

The compose stack already preconfigures the external PostgreSQL connection. Atlassian's current Docker guidance covers database bootstrapping, but the Jira application wizard still owns the application title, base URL, license, and first admin creation. In practice the supported automation path here is browser-driven wizard automation, not a zero-click container-only bypass.

Wizard defaults used by the local browser skill:

- Application title: `Agile Tools Local Jira`
- Mode: `private`
- Base URL: value from `JIRA_SETUP_BASE_URL`, or `JIRA_BOOTSTRAP_PUBLIC_BASE_URL` when `JIRA_SETUP_BASE_URL` is unset
- Admin username/password: `JIRA_BOOTSTRAP_USERNAME` and `JIRA_BOOTSTRAP_PASSWORD`
- Admin display name: `JIRA_SETUP_ADMIN_DISPLAY_NAME` or `Agile Tools Local Admin`
- Admin email: `JIRA_SETUP_ADMIN_EMAIL` or `<username>@example.test`

If you want to override those defaults, add the optional `JIRA_SETUP_*` variables from [.env.example](../.env.example) to your local `.env`.

Licensing note:

- Atlassian's self-serve Jira Data Center trial flow changed on 2026-03-30.
- If you already have a host product key, set `JIRA_SETUP_LICENSE_KEY`.
- For local throwaway testing, the repo skill also supports Atlassian's public timebomb page and uses the `10 user Jira Software Data Center license, expires in 3 hours` host product key.

## Optional Post-Setup Bootstrap

After the first-run wizard is complete, the compose file can seed the minimum Agile Tools data for you:

- one software project
- one Kanban board and backing filter
- several sample issues with real transition history
- one PAT for the Jira user you supply

Add the bootstrap credentials to your local `.env` first:

```bash
JIRA_BOOTSTRAP_USERNAME=<your-local-jira-admin-or-test-user>
JIRA_BOOTSTRAP_PASSWORD=<that-user-password>
```

Then run the one-shot bootstrap service:

```bash
docker compose -f docker-compose.jira.yml --profile bootstrap run --rm jira-bootstrap
```

The service waits for Jira to accept authenticated API requests, so it is safe to run immediately after the wizard if the app is still finishing startup.

Bootstrap output is written to `.jira-local/jira-bootstrap.json` and includes the seeded project key, board id, issue keys, and any PAT the script created.

## Minimum Jira Data Setup

If you use the bootstrap service, this section is already covered for the seeded project and board.

If you prefer to set Jira up by hand instead, create the following:

1. One software project.
2. One Kanban board backed by that project.
3. At least the normal active flow statuses such as `To Do`, `In Progress`, and `Done`.
4. Optional: a terminal status such as `Closed` that is not mapped to a visible board column, if you want to test off-board completion handling.
5. Several issues with at least a few workflow transitions so Jira has real changelog history.

## Service Account And PAT

The bootstrap service can create a PAT automatically for the Jira user whose credentials you provide.

If you want a separate service account instead of using the bootstrap user directly:

1. Create a dedicated user such as `agile-tools-sync`.
2. Give that user access to the test project and board.
3. Sign in as that user.
4. Go to **Profile → Personal access tokens**.
5. Create a PAT and copy it immediately; Jira will not show it again.

Agile Tools sends the PAT as a bearer token, matching Atlassian's PAT guidance.

## Minimum Permissions

The Agile Tools Jira client only needs read access after the initial Jira setup is complete.

- The user must be able to sign in and create a PAT.
- The user must be able to see the Kanban board.
- The user must be able to browse issues in the board's projects.
- The user must be able to read issue history and changelog entries.
- The user must be able to read project status metadata, issue types, and fields.

No Jira admin permission is required for the Agile Tools connection itself once the Jira project, board, and PAT already exist.

## What Agile Tools Calls

During validation, board discovery, and sync, Agile Tools reads these Jira endpoints:

- `/rest/api/2/myself`
- `/rest/api/2/serverInfo`
- `/rest/agile/1.0/board`
- `/rest/agile/1.0/board/{boardId}/configuration`
- `/rest/agile/1.0/board/{boardId}/project`
- `/rest/api/2/status`
- `/rest/api/2/issuetype`
- `/rest/api/2/field`
- `/rest/api/2/project/{projectKey}/statuses`
- `/rest/agile/1.0/board/{boardId}/issue`
- `/rest/api/2/search`
- `/rest/api/2/issue/{issueIdOrKey}/changelog`

Those calls come from [packages/jira-client/src/client.ts](../packages/jira-client/src/client.ts), [packages/jira-client/src/discovery.ts](../packages/jira-client/src/discovery.ts), and [packages/jira-client/src/issues.ts](../packages/jira-client/src/issues.ts).

## Connect Agile Tools

1. Start Agile Tools normally from the main stack or local dev flow.
2. Open **Admin → Jira Connections**.
3. Use the Jira base URL that matches the Agile Tools runtime:
	- `http://localhost:<JIRA_PORT>` when the Agile Tools web app is running directly on the host
	- `http://host.docker.internal:<JIRA_PORT>` when the Agile Tools web app is running in Docker
4. Paste the PAT for the seeded Jira user, or the dedicated service account if you created one manually.
5. Validate the connection.
6. Discover boards and select the test Kanban board.

## Stop Or Reset

Stop the local Jira stack:

```bash
docker compose -f docker-compose.jira.yml down
```

Destroy the Jira database and home volumes as well:

```bash
docker compose -f docker-compose.jira.yml down -v
```

If you also want to clear `.jira-local` and the local Agile Tools admin setup, prefer the reset helper instead:

```bash
node docker/reset-local-jira-stack.mjs
```