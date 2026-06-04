import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { recordDatabaseQuery, resolveDatabaseUrlFromEnv } from '@agile-tools/shared';

let _client: PrismaClient | undefined;

function queryOperation(query: string): string {
  return query.match(/^\s*(\w+)/)?.[1]?.toUpperCase() ?? 'UNKNOWN';
}

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    // Resolve any DATABASE_URL_ENV_VAR indirection into process.env.DATABASE_URL
    // before the PostgreSQL driver adapter reads the connection string. Avoid
    // calling the full getConfig() here so that contexts which only need
    // database access (e.g. some tests) don't have to satisfy unrelated config
    // like ENCRYPTION_KEY.
    resolveDatabaseUrlFromEnv();
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('Invalid environment configuration:\n  DATABASE_URL: Required');
    }

    const adapter = new PrismaPg({ connectionString });
    const client = new PrismaClient({
      adapter,
      log:
        process.env['NODE_ENV'] === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
    });
    client.$on('query', (event: Prisma.QueryEvent) => {
      recordDatabaseQuery({
        operation: queryOperation(event.query),
        durationSeconds: event.duration / 1000,
      });
    });
    _client = client;
  }
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
  }
}
