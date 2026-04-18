import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  /** 32+ character key used for AES-256-GCM PAT encryption */
  ENCRYPTION_KEY: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Opaque session secret for workspace auth (Next.js web only) */
  SESSION_SECRET: z.string().min(32).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** 5–15 minute default sync interval guard — scopes override this per board */
  DEFAULT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(15).default(10),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | undefined;

export function getConfig(): Config {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
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

/** Reset the cached config — only used in tests. */
export function resetConfig(): void {
  _config = undefined;
}
