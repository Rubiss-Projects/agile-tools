import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { execSync } from 'node:child_process';

const PG_IMAGE = 'postgres:16-alpine';
const PG_PORT = 5432;

let container: StartedTestContainer | undefined;

export interface PostgresInstance {
  connectionUrl: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Start a throwaway PostgreSQL container.
 * Runs Prisma migrations after the container is ready so tests use the full
 * production schema.
 */
export async function startPostgres(): Promise<PostgresInstance> {
  const username = 'test';
  const password = 'test';
  const database = 'agile_test';

  container = await new GenericContainer(PG_IMAGE)
    .withEnvironment({
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: database,
    })
    .withExposedPorts(PG_PORT)
    // The official Postgres image can emit an early readiness log during
    // initialization before the final server is reachable on the mapped port.
    .withWaitStrategy(
      Wait.forAll([
        Wait.forListeningPorts(),
        Wait.forLogMessage('database system is ready to accept connections', 2),
      ]).withStartupTimeout(120_000),
    )
    .start();

  const port = container.getMappedPort(PG_PORT);
  const host = container.getHost();
  const connectionUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`;

  // Run Prisma migrations so tests work against the real schema.
  execSync('pnpm --filter @agile-tools/db prisma:migrate', {
    env: { ...process.env, DATABASE_URL: connectionUrl },
    stdio: 'inherit',
  });

  return { connectionUrl, host, port, database, username, password };
}

/**
 * Stop and remove the container.  Call this in a globalTeardown or afterAll.
 */
export async function stopPostgres(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
