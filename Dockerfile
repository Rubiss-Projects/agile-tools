# syntax=docker/dockerfile:1.7

FROM node:22.22.2-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

FROM base AS build

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @agile-tools/db prisma:generate
RUN pnpm build

FROM build AS prod-deps

ENV CI=true
ENV NODE_ENV=production

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM node:22.22.2-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV AGILE_TOOLS_ROLE=web

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl tini \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=prod-deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=prod-deps /workspace/apps/web/node_modules ./apps/web/node_modules
COPY --chown=node:node --from=prod-deps /workspace/apps/worker/node_modules ./apps/worker/node_modules
COPY --chown=node:node --from=prod-deps /workspace/packages/analytics/node_modules ./packages/analytics/node_modules
COPY --chown=node:node --from=prod-deps /workspace/packages/db/node_modules ./packages/db/node_modules
COPY --chown=node:node --from=prod-deps /workspace/packages/jira-client/node_modules ./packages/jira-client/node_modules
COPY --chown=node:node --from=prod-deps /workspace/packages/shared/node_modules ./packages/shared/node_modules

COPY --chown=node:node --from=build /workspace/apps/web/package.json ./apps/web/package.json
COPY --chown=node:node --from=build /workspace/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --chown=node:node --from=build /workspace/apps/web/.next ./apps/web/.next

COPY --chown=node:node --from=build /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --chown=node:node --from=build /workspace/apps/worker/dist ./apps/worker/dist

COPY --chown=node:node --from=build /workspace/packages/analytics/package.json ./packages/analytics/package.json
COPY --chown=node:node --from=build /workspace/packages/analytics/dist ./packages/analytics/dist

COPY --chown=node:node --from=build /workspace/packages/db/package.json ./packages/db/package.json
COPY --chown=node:node --from=build /workspace/packages/db/dist ./packages/db/dist
COPY --chown=node:node --from=build /workspace/packages/db/prisma ./packages/db/prisma

COPY --chown=node:node --from=build /workspace/packages/jira-client/package.json ./packages/jira-client/package.json
COPY --chown=node:node --from=build /workspace/packages/jira-client/dist ./packages/jira-client/dist

COPY --chown=node:node --from=build /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=build /workspace/packages/shared/dist ./packages/shared/dist

COPY --chown=node:node --from=build /workspace/docker ./docker

RUN chmod +x /app/docker/run.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "/app/docker/healthcheck.mjs"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/run.sh"]
CMD ["web"]