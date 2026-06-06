import { z } from 'zod';

export const AuthProviderSchema = z.enum(['local_session', 'clerk']);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

export const SyncBackendSchema = z.enum(['pgboss', 'vercel_queues']);
export type SyncBackend = z.infer<typeof SyncBackendSchema>;

export const JiraConnectionPolicySchema = z.enum([
  'self_hosted_tokens',
  'cloud_oauth_only',
]);
export type JiraConnectionPolicy = z.infer<typeof JiraConnectionPolicySchema>;

export const HostedLaunchTierSchema = z.enum(['hobby_beta', 'production_paid']);
export type HostedLaunchTier = z.infer<typeof HostedLaunchTierSchema>;

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  /** 32+ character key used for AES-256-GCM PAT encryption */
  ENCRYPTION_KEY: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Opaque session secret for workspace auth (Next.js web only) */
  SESSION_SECRET: z.string().min(32).optional(),
  AUTH_PROVIDER: AuthProviderSchema.default('local_session'),
  SYNC_BACKEND: SyncBackendSchema.default('pgboss'),
  JIRA_CONNECTION_POLICY: JiraConnectionPolicySchema.default('self_hosted_tokens'),
  HOSTED_LAUNCH_TIER: HostedLaunchTierSchema.optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Host interface for standalone metrics servers such as the worker runtime. */
  METRICS_HOST: z.string().min(1).default('0.0.0.0'),
  /** Port for standalone metrics servers. Falls back to PORT when METRICS_PORT is unset. */
  METRICS_PORT: z.coerce.number().int().positive().default(9464),
  /** 5–15 minute default sync interval guard — scopes override this per board */
  DEFAULT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(15).default(10),
  /**
   * Maximum runtime (ms) of the Prisma interactive transaction that publishes
   * staged Jira sync results to `WorkItem`/`WorkItemLifecycleEvent`. Prisma's
   * default of 5 s is not enough for large boards, where per-item upserts and
   * lifecycle event inserts can take longer. Default: 10 minutes.
   */
  SYNC_PUBLISH_TRANSACTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(60 * 60 * 1000)
    .default(10 * 60 * 1000),
  /**
   * Maximum time (ms) Prisma will wait to acquire a connection before starting
   * the publish transaction. Default: 30 seconds.
   */
  SYNC_PUBLISH_TRANSACTION_MAX_WAIT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(5 * 60 * 1000)
    .default(30_000),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  ATLASSIAN_CLIENT_ID: z.string().min(1).optional(),
  ATLASSIAN_CLIENT_SECRET: z.string().min(1).optional(),
  ATLASSIAN_REDIRECT_URI: z.string().url().optional(),
  ATLASSIAN_SCOPES: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  HOSTED_BETA_TICK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  HOSTED_BETA_MIN_SCHEDULED_SYNC_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(15)
    .default(1440),
  HOSTED_BETA_MANUAL_SYNC_COOLDOWN_MINUTES: z.coerce.number().int().min(0).default(360),
  HOSTED_BETA_SYNC_CHUNK_TARGET_SECONDS: z.coerce.number().int().min(1).max(25).default(8),
  HOSTED_BETA_SYNC_CHUNK_MAX_SECONDS: z.coerce.number().int().min(5).max(30).default(30),
  HOSTED_BETA_MAX_WORKSPACES: z.coerce.number().int().min(1).default(5),
  HOSTED_BETA_MAX_CONNECTIONS_PER_WORKSPACE: z.coerce.number().int().min(1).default(1),
  HOSTED_BETA_MAX_SCOPES_PER_WORKSPACE: z.coerce.number().int().min(1).default(1),
  HOSTED_BETA_MAX_ORG_MEMBERS: z.coerce.number().int().min(1).default(5),
  HOSTED_BETA_MAX_ACTIVE_ISSUES_PER_SCOPE: z.coerce.number().int().min(1).default(500),
  HOSTED_BETA_MAX_COMPLETED_ISSUES_PER_SYNC: z.coerce.number().int().min(1).default(1000),
  HOSTED_BETA_MAX_SYNC_RUNS_PER_WORKSPACE_PER_DAY: z.coerce
    .number()
    .int()
    .min(1)
    .default(2),
  HOSTED_PRISMA_MONTHLY_OP_BUDGET: z.coerce.number().int().min(1).default(40_000),
  HOSTED_VERCEL_FUNCTION_INVOCATION_BUDGET: z.coerce
    .number()
    .int()
    .min(1)
    .default(500_000),
  HOSTED_VERCEL_QUEUE_OPERATION_BUDGET: z.coerce
    .number()
    .int()
    .min(1)
    .default(500_000),
  HOSTED_VERCEL_ACTIVE_CPU_HOURS_BUDGET: z.coerce.number().min(0.1).default(2),
}).superRefine((value, ctx) => {
  const hostedMode =
    value.AUTH_PROVIDER === 'clerk' ||
    value.SYNC_BACKEND === 'vercel_queues' ||
    value.JIRA_CONNECTION_POLICY === 'cloud_oauth_only';

  if (hostedMode) {
    if (value.AUTH_PROVIDER !== 'clerk') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_PROVIDER'],
        message: 'Hosted mode requires AUTH_PROVIDER=clerk.',
      });
    }
    if (value.SYNC_BACKEND !== 'vercel_queues') {
      ctx.addIssue({
        code: 'custom',
        path: ['SYNC_BACKEND'],
        message: 'Hosted mode requires SYNC_BACKEND=vercel_queues.',
      });
    }
    if (value.JIRA_CONNECTION_POLICY !== 'cloud_oauth_only') {
      ctx.addIssue({
        code: 'custom',
        path: ['JIRA_CONNECTION_POLICY'],
        message: 'Hosted mode requires JIRA_CONNECTION_POLICY=cloud_oauth_only.',
      });
    }
    for (const key of [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'ATLASSIAN_CLIENT_ID',
      'ATLASSIAN_CLIENT_SECRET',
      'ATLASSIAN_REDIRECT_URI',
      'ATLASSIAN_SCOPES',
      'CRON_SECRET',
    ] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in hosted mode.`,
        });
      }
    }
  }
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | undefined;

function buildConfigInput(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    METRICS_PORT: process.env['METRICS_PORT'] ?? process.env['PORT'] ?? '9464',
  };
}

/**
 * Resolve the database URL from a configurable source variable.
 *
 * Managed-service deployments often inject the PostgreSQL connection string
 * under an autogenerated variable name (e.g. `XYZ_POSTGRESQL_URI`) that the
 * application cannot rename. Setting `DATABASE_URL_ENV_VAR` to that name lets
 * shared config read the connection string from there while preserving the
 * default `DATABASE_URL` behavior for local/dev/docker usage.
 *
 * Side effect: when `DATABASE_URL_ENV_VAR` is used, the resolved value is
 * written back to `process.env.DATABASE_URL` so that downstream consumers that
 * read the environment directly (notably Prisma, which resolves
 * `env("DATABASE_URL")` from the schema at client construction time) see a
 * consistent value.
 */
export function resolveDatabaseUrlFromEnv(): void {
  const sourceVarName = process.env['DATABASE_URL_ENV_VAR'];
  if (sourceVarName === undefined || sourceVarName === '') {
    return;
  }

  if (sourceVarName === 'DATABASE_URL') {
    // Explicitly pointing at the default name is a no-op; fall through to the
    // standard DATABASE_URL parsing below.
    return;
  }

  // Constrain the variable name to a POSIX identifier shape. This keeps the
  // configurable indirection from being abused to probe arbitrary properties
  // of `process.env`.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sourceVarName)) {
    throw new Error(
      `Invalid environment configuration:\n  DATABASE_URL_ENV_VAR: "${sourceVarName}" is not a valid environment variable name (allowed: [A-Za-z_][A-Za-z0-9_]*)`,
    );
  }

  const resolved = process.env[sourceVarName];
  if (resolved === undefined || resolved === '') {
    throw new Error(
      `Invalid environment configuration:\n  DATABASE_URL_ENV_VAR: points to "${sourceVarName}", but that variable is not set or is empty`,
    );
  }

  process.env['DATABASE_URL'] = resolved;
}

export function getConfig(): Config {
  if (_config) return _config;

  resolveDatabaseUrlFromEnv();

  const result = configSchema.safeParse(buildConfigInput());
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }

  _config = result.data;
  return _config;
}

export function isHostedMode(config: Config = getConfig()): boolean {
  return (
    config.AUTH_PROVIDER === 'clerk' &&
    config.SYNC_BACKEND === 'vercel_queues' &&
    config.JIRA_CONNECTION_POLICY === 'cloud_oauth_only'
  );
}

export function getHostedLaunchTier(config: Config = getConfig()): HostedLaunchTier {
  return config.HOSTED_LAUNCH_TIER ?? (isHostedMode(config) ? 'hobby_beta' : 'hobby_beta');
}

/** Reset the cached config — only used in tests. */
export function resetConfig(): void {
  _config = undefined;
}
