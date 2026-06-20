# Self-Hosted OIDC SSO

This guide covers the self-hosted `AUTH_PROVIDER=oidc` path. Hosted Vercel
deployments remain Clerk-only.

OIDC is opt-in. Leaving `AUTH_PROVIDER` unset, or setting it to
`local_session`, preserves the existing unauthenticated landing page,
read-only fallback option, and local admin bootstrap cookie flow.

## App Registration

Create a confidential OIDC web application in your identity provider with:

| Setting | Value |
|---|---|
| Client type | Confidential web application |
| Flow | Authorization Code |
| PKCE | Required or allowed, `S256` |
| Client authentication | Client secret, either `client_secret_basic` or `client_secret_post` |
| Redirect URI | `https://<agile-tools-host>/api/oidc/callback` |
| Post-logout redirect URI | `https://<agile-tools-host>/` |
| Implicit flow | Disabled |
| Resource owner password flow | Disabled |

Use HTTPS for real deployments. `OIDC_ALLOW_INSECURE_HTTP=true` is only for
loopback/local testing.

## Required Claims

Agile Tools uses standard OIDC discovery and validates the ID token. The
identity provider must expose:

| Claim | Required | Purpose |
|---|---|---|
| `iss` | Yes | Must match the discovered issuer or an entry in `OIDC_ALLOWED_ISSUERS`. |
| `sub` | Strongly recommended | Stable user identifier. If absent, Agile Tools falls back to `oid`, then `email`. |
| `email` | Recommended | Admin email mapping and display fallback. |
| `name` or `preferred_username` | Optional | Display name fallback. |
| Admin claim | Optional | Used when `OIDC_ADMIN_CLAIM` and `OIDC_ADMIN_CLAIM_VALUES` are configured. |

The admin claim can be any string or string-array claim available in the ID
token or UserInfo response. Common choices are:

| IdP pattern | Agile Tools config |
|---|---|
| Group membership claim named `groups` containing `agile-tools-admins` | `OIDC_ADMIN_CLAIM=groups`, `OIDC_ADMIN_CLAIM_VALUES=agile-tools-admins` |
| Application role claim named `roles` containing `AgileTools.Admin` | `OIDC_ADMIN_CLAIM=roles`, `OIDC_ADMIN_CLAIM_VALUES=AgileTools.Admin` |
| Email-only bootstrap for one or two operators | `OIDC_ADMIN_EMAILS=admin@example.com,owner@example.com` |

Prefer a group or app-role claim for ongoing administration. Email mapping is
useful for bootstrapping, but it depends on the IdP keeping email addresses
stable and verified.

If your IdP only emits group or role claims when a particular scope is
requested, add that scope to `OIDC_SCOPES`. The value must always include
`openid`; the default is `openid profile email`. Add `offline_access` only if
your IdP requires it to issue refresh tokens and your security policy permits
longer-lived sessions.

## New Self-Hosted Workspace

For a new self-hosted OIDC deployment, choose a stable workspace ID and use it
for `OIDC_WORKSPACE_ID`. On first successful OIDC login, Agile Tools creates
that workspace if it does not already exist.

Configure the first administrator before they sign in:

```bash
AUTH_PROVIDER=oidc
OIDC_WORKSPACE_ID=00000000-0000-4000-8000-000000000011
OIDC_ADMIN_EMAILS=admin@example.com
# or:
OIDC_ADMIN_CLAIM=groups
OIDC_ADMIN_CLAIM_VALUES=agile-tools-admins
```

When the mapped user signs in through SSO, the new `WorkspaceUser` row is
created with role `admin`, and that user can open `/admin/jira`.

## Existing Workspace Migration

For an existing self-hosted deployment with Jira connections, scopes, or sync
history, do not generate a new workspace ID. Point OIDC at the existing
workspace so the SSO user lands on the same Jira setup and analytics data.

1. Apply migrations so OIDC users and sessions can be stored:

```bash
pnpm --filter @agile-tools/db exec prisma migrate deploy
```

2. Find the existing workspace ID:

```sql
select id, name, "defaultTimezone"
from "Workspace"
order by "createdAt";
```

If there are multiple workspaces, identify the one that owns the Jira setup:

```sql
select
  w.id,
  w.name,
  count(distinct jc.id) as jira_connections,
  count(distinct fs.id) as flow_scopes
from "Workspace" w
left join "JiraConnection" jc on jc."workspaceId" = w.id
left join "FlowScope" fs on fs."workspaceId" = w.id
group by w.id, w.name
order by w."createdAt";
```

3. Set OIDC to that workspace ID and configure at least one admin mapping:

```bash
AUTH_PROVIDER=oidc
OIDC_WORKSPACE_ID=<existing Workspace.id>
OIDC_ADMIN_CLAIM=groups
OIDC_ADMIN_CLAIM_VALUES=agile-tools-admins
# optional for first operator bootstrap:
OIDC_ADMIN_EMAILS=admin@example.com
```

4. Restart the web app and have the mapped administrator sign in through SSO.

The first OIDC login creates a `WorkspaceUser` in the existing workspace. Jira
connections, flow scopes, and sync data remain attached to that workspace, so
the OIDC admin can continue the existing `/admin/jira` setup.

## Existing OIDC User Was Created As Member

Agile Tools does not overwrite an existing `WorkspaceUser.role` when claims
change later. This prevents a transient IdP claim change from silently
promoting or demoting users.

If the first admin signed in before `OIDC_ADMIN_EMAILS` or
`OIDC_ADMIN_CLAIM_VALUES` was configured, update the stored role explicitly:

```sql
select id, email, "displayName", role, "externalSubject"
from "WorkspaceUser"
where "workspaceId" = '<existing Workspace.id>'
order by "createdAt";
```

Then promote the intended user:

```sql
update "WorkspaceUser"
set role = 'admin'
where "workspaceId" = '<existing Workspace.id>'
  and email = 'admin@example.com';
```

After promotion, that user can open `/admin/jira` on their next request or
after signing out and back in.

## Session Lifetime

`OIDC_SESSION_MAX_AGE_SECONDS` controls Agile Tools' own OIDC cookies and
defaults to 14 days. The effective authenticated lifetime is still capped by
the IdP:

- If the access token is still valid, the local OIDC session remains usable.
- If the access token is close to expiry and the IdP issued a refresh token,
  Agile Tools attempts a refresh.
- If no refresh token exists, or refresh fails, the local OIDC session row is
  deleted and the user must sign in again.

## Auto-Login

`OIDC_AUTO_LOGIN=false` by default. When set to `true`, unauthenticated browser
page requests are redirected to `/api/oidc/login?next=<path>`.

The redirect intentionally excludes API routes, metrics, static assets, and
OIDC callback/logout endpoints so existing unauthenticated HTTP behavior does
not regress.

## Local Keycloak Example

The local demo realm in `docker/keycloak/agile-tools-realm.json` shows a
working claim setup:

- Client `agile-tools` is confidential.
- Redirect URI is `http://localhost:3000/api/oidc/callback`.
- PKCE method is `S256`.
- The `groups` mapper emits group membership into the ID token, access token,
  and UserInfo response.
- User `admin@example.test` belongs to `agile-tools-admins`.

The matching Agile Tools config is:

```bash
OIDC_ADMIN_CLAIM=groups
OIDC_ADMIN_CLAIM_VALUES=agile-tools-admins
```

See [local-oidc-sso.md](local-oidc-sso.md) for the full local demo.
