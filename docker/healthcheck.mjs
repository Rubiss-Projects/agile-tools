import { readFile } from 'node:fs/promises';

async function readRole() {
  try {
    const value = await readFile('/tmp/agile-tools-role', 'utf8');
    return value.trim() || 'web';
  } catch {
    return process.env.AGILE_TOOLS_ROLE ?? 'web';
  }
}

async function checkWeb() {
  const port = process.env.PORT ?? '3000';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
      cache: 'no-store',
      headers: {
        'x-forwarded-proto': 'https',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Unexpected health status: ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function checkWorker() {
  const { disconnectPrisma, getPrismaClient } = await import('../packages/db/dist/index.js');

  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
  } finally {
    await disconnectPrisma().catch(() => undefined);
  }
}

try {
  const role = await readRole();

  if (role === 'worker') {
    await checkWorker();
  } else {
    await checkWeb();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown healthcheck error';
  console.error(message);
  process.exit(1);
}