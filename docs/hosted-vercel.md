# Hosted Vercel Beta

This mode adds a hosted Agile Tools path without changing the Docker/self-hosted model.

## Deployment Modes

Self-hosted defaults remain:

```env
AUTH_PROVIDER=local_session
SYNC_BACKEND=pgboss
JIRA_CONNECTION_POLICY=self_hosted_tokens
```

Hosted Vercel beta uses:

```env
AUTH_PROVIDER=clerk
SYNC_BACKEND=vercel_queues
JIRA_CONNECTION_POLICY=cloud_oauth_only
HOSTED_LAUNCH_TIER=hobby_beta
```

Docker users do not need Clerk, Atlassian OAuth, Vercel, or Queue variables.

## Hobby Beta Limits

The first hosted deployment is a non-commercial Hobby beta. Key limits affecting the design:

- Vercel Cron can run only once per day on Hobby.
- Runtime logs are retained for 1 hour.
- The account has one concurrent build.
- Included monthly usage is limited; app-side budgets intentionally stay below plan quotas.

The app uses one daily watchdog cron at `/api/hosted/cron/sync-watchdog` and Vercel Queue delayed messages for the 15-minute scheduler tick. Scheduled syncs default to once per day per scope.

## Vercel Project

Create a new Vercel project named `agile-tools` under scope `rubiss` with `apps/web` as the Vercel Root Directory.
The repository remains the source root for CI commands, but Vercel Queue triggers are configured relative to the Next.js app root.

Local setup may use:

```bash
vercel link
```

Do not commit `.vercel/`; it is gitignored. CI uses:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The production release workflow runs:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
pnpm --filter @agile-tools/db exec prisma migrate deploy
vercel build --prod --token="$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
```

## Prisma Postgres

Create separate Prisma Postgres databases:

- `agile-tools-production`
- `agile-tools-preview`

These databases share the Prisma account's free quota; separation prevents accidental data overlap but does not isolate quota consumption. Configure production and preview Vercel environments with the corresponding database URL.

Before launch, verify `btree_gist` support:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

Production migrations run only from stable GitHub Releases. Preview migrations should be run against the preview database before preview validation.

## Clerk

Hosted mode requires Clerk:

- Enable Organizations.
- Allow open signup for the beta.
- Clerk Organization maps one-to-one to `Workspace.clerkOrgId`.
- Clerk `org:admin` maps to app `admin`.
- Clerk org members map to app `member`.

Hosted beta caps:

- 5 workspaces.
- 5 members per organization.

## Atlassian OAuth

Hosted Jira support is Jira Cloud OAuth 2.0 3LO only.

Set:

```env
ATLASSIAN_CLIENT_ID=
ATLASSIAN_CLIENT_SECRET=
ATLASSIAN_REDIRECT_URI=https://<host>/api/atlassian/oauth/callback
ATLASSIAN_SCOPES=read:jira-user read:jira-work offline_access
```

The callback validates signed state bound to Clerk user, active organization, nonce, and return URL. Access and refresh tokens are encrypted with `ENCRYPTION_KEY`. Token refresh failures mark the connection unhealthy and require reconnect.

## Queues And Watchdog

`apps/web/vercel.json` configures:

- Daily cron: `0 3 * * *` at `/api/hosted/cron/sync-watchdog`.
- Queue topic `hosted-sync` for scope sync work.
- Queue topic `hosted-sync-tick` for scheduler ticks.

The ticker scans due active scopes, enqueues bounded work, and schedules the next tick with a 15-minute delay. The watchdog reseeds the tick if no recent tick was observed.

## Budgets

Durable budget tables are seeded from environment values:

- `HOSTED_PRISMA_MONTHLY_OP_BUDGET=40000` in production.
- `HOSTED_PRISMA_MONTHLY_OP_BUDGET=10000` in preview.
- `HOSTED_VERCEL_FUNCTION_INVOCATION_BUDGET=500000`.
- `HOSTED_VERCEL_QUEUE_OPERATION_BUDGET=500000`.
- `HOSTED_VERCEL_ACTIVE_CPU_HOURS_BUDGET=2`.

At 80 percent, the app shows admin warnings and disables scheduled sync. At 100 percent, it blocks workspace creation, Jira connection creation, scheduled sync, and manual sync. Existing analytics stay readable.

## Release Gate

Production Vercel deployment is inside `.github/workflows/release.yml` after:

1. Semver tag resolution.
2. Default-branch ancestry check.
3. GHCR image build/publish.
4. GitHub Release creation or verification.
5. Production migration.
6. Vercel production build/deploy.

Stable tags such as `v1.2.3` deploy production. Prereleases such as `v1.2.3-rc.1` do not. Normal `main` pushes do not deploy production.

## Upgrade Gates

Before broader public or commercial production:

- Upgrade Vercel from Hobby to Pro or higher.
- Consider replacing the queue ticker with 5-minute Vercel Cron.
- Move Prisma Postgres to isolated or paid capacity.
- Upgrade Clerk if retained organizations or org size exceed Free limits.
- Revisit beta caps after load testing.
