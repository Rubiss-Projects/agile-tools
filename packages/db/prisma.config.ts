import { defineConfig } from 'prisma/config';

const FALLBACK_GENERATE_DATABASE_URL =
  'postgresql://prisma:prisma@127.0.0.1:65535/prisma_generate_placeholder';

function resolveDatabaseUrl(): string {
  const sourceVarName = process.env['DATABASE_URL_ENV_VAR'];

  if (sourceVarName !== undefined && sourceVarName !== '' && sourceVarName !== 'DATABASE_URL') {
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

    return resolved;
  }

  return process.env['DATABASE_URL'] ?? FALLBACK_GENERATE_DATABASE_URL;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
