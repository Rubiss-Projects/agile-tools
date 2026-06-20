# Local OIDC SSO Demo

This optional demo runs a local Keycloak identity provider for self-hosted SSO
testing. It does not change the default `AUTH_PROVIDER=local_session` path.

For production OIDC setup, IdP claim mapping, and existing workspace
migration, see [self-hosted-oidc-sso.md](self-hosted-oidc-sso.md).

## Start Keycloak

```bash
docker compose -f docker-compose.oidc.yml up -d
```

Keycloak is bound to `127.0.0.1:8081` and is available at
`http://localhost:8081`. The imported realm is `agile-tools`.

Demo users:

| User | Password | Expected app role |
|---|---|---|
| `admin@example.test` | `agile-tools-admin` | `admin` |
| `member@example.test` | `agile-tools-member` | `member` |

The Keycloak admin console is available with `admin` / `admin`. These are
local demo credentials only; do not expose this compose service outside the
local machine or reuse the realm export for a real IdP.

## Run Agile Tools With OIDC

Apply database migrations first so OIDC users and sessions can be stored:

```bash
pnpm --filter @agile-tools/db exec prisma migrate deploy
```

Then start the web app with OIDC settings:

```bash
AUTH_PROVIDER=oidc \
OIDC_ISSUER=http://localhost:8081/realms/agile-tools \
OIDC_CLIENT_ID=agile-tools \
OIDC_CLIENT_SECRET=local-keycloak-client-secret \
OIDC_REDIRECT_URI=http://localhost:3000/api/oidc/callback \
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/ \
OIDC_SCOPES="openid profile email" \
OIDC_ALLOWED_ISSUERS=http://localhost:8081/realms/agile-tools \
OIDC_WORKSPACE_ID=00000000-0000-4000-8000-000000000150 \
OIDC_WORKSPACE_NAME="OIDC Demo Workspace" \
OIDC_ADMIN_EMAILS=admin@example.test \
OIDC_ADMIN_CLAIM=groups \
OIDC_ADMIN_CLAIM_VALUES=agile-tools-admins \
OIDC_ALLOW_INSECURE_HTTP=true \
OIDC_AUTO_LOGIN=false \
OIDC_SESSION_MAX_AGE_SECONDS=1209600 \
pnpm --filter @agile-tools/web dev
```

Keep `AUTH_PROVIDER=local_session` or leave it unset to use the existing local
unauthenticated landing page, read-only fallback option, and local admin
bootstrap cookie flow.

`OIDC_AUTO_LOGIN` is intentionally opt-in. When it is `true`, browser page
requests without an `agile_session` cookie are redirected to
`/api/oidc/login?next=<path>`. API routes, metrics, static assets, and OIDC
callback/logout endpoints are not redirected.

`OIDC_SESSION_MAX_AGE_SECONDS` controls the Agile Tools OIDC cookies only. The
effective authenticated lifetime is still capped by the IdP access-token and
refresh-token policy; if token refresh fails, the local OIDC session row is
deleted and the user must sign in again.
