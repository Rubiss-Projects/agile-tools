import { execSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

import { disconnectPrisma, getPrismaClient } from '../client.js';
import {
  STALE_ACTIVE_SYNC_RUN_TIMEOUT_MS,
  acquireScopeSyncLock,
  resolveActiveSyncRun,
} from './sync-runs.js';

let workspaceId: string;
let connectionId: string;
let scopeId: string;
let postgresContainer: StartedTestContainer | undefined;
const POSTGRES_HOOK_TIMEOUT_MS = 120_000;

async function startPostgres() {
  postgresContainer = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'agile_test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forAll([
        Wait.forListeningPorts(),
        Wait.forLogMessage('database system is ready to accept connections', 2),
      ]).withStartupTimeout(120_000),
    )
    .start();

  const connectionUrl = `postgresql://test:test@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/agile_test`;

  execSync('pnpm --filter @agile-tools/db exec prisma migrate dev --skip-generate', {
    env: { ...process.env, DATABASE_URL: connectionUrl },
    stdio: 'inherit',
  });

  return connectionUrl;
}

async function stopPostgres() {
  if (!postgresContainer) return;
  await postgresContainer.stop();
  postgresContainer = undefined;
}

beforeAll(async () => {
  process.env['DATABASE_URL'] = await startPostgres();
  await disconnectPrisma();
}, POSTGRES_HOOK_TIMEOUT_MS);

afterAll(async () => {
  await disconnectPrisma();
  await stopPostgres();
}, POSTGRES_HOOK_TIMEOUT_MS);

beforeEach(async () => {
  const db = getPrismaClient();
  await db.syncRun.deleteMany();
  await db.flowScope.deleteMany();
  await db.jiraConnection.deleteMany();
  await db.workspace.deleteMany();

  const workspace = await db.workspace.create({
    data: { name: 'Sync Run Repository Tests', defaultTimezone: 'UTC' },
  });
  workspaceId = workspace.id;

  const connection = await db.jiraConnection.create({
    data: {
      workspaceId,
      baseUrl: 'https://jira.example.internal',
      authType: 'pat',
      encryptedSecretRef: 'encrypted-secret',
    },
  });
  connectionId = connection.id;

  const scope = await db.flowScope.create({
    data: {
      workspaceId,
      connectionId,
      boardId: '1',
      boardName: 'Sync Board',
      timezone: 'UTC',
      includedIssueTypeIds: ['story'],
      includedIssueTypeNames: ['Story'],
      startStatusIds: ['10'],
      doneStatusIds: ['40'],
      syncIntervalMinutes: 10,
    },
  });
  scopeId = scope.id;
});

describe('resolveActiveSyncRun', () => {
  it('fails a stale queued sync and returns no active run', async () => {
    const db = getPrismaClient();
    const now = new Date('2026-04-30T12:00:00.000Z');
    const staleCreatedAt = new Date(now.getTime() - STALE_ACTIVE_SYNC_RUN_TIMEOUT_MS - 1_000);

    const staleRun = await db.syncRun.create({
      data: {
        scopeId,
        trigger: 'manual',
        status: 'queued',
      },
    });
    await db.$executeRaw`
      UPDATE "SyncRun"
      SET "createdAt" = ${staleCreatedAt}
      WHERE id = ${staleRun.id}
    `;

    const activeRun = await db.$transaction(async (tx) => {
      await acquireScopeSyncLock(tx, scopeId);
      return resolveActiveSyncRun(tx, workspaceId, scopeId, now);
    });

    expect(activeRun).toBeNull();

    const updatedRun = await db.syncRun.findUniqueOrThrow({ where: { id: staleRun.id } });
    expect(updatedRun.status).toBe('failed');
    expect(updatedRun.errorCode).toBe('SYNC_STALE_TIMEOUT');
    expect(updatedRun.errorSummary).toContain('60-minute timeout');
    expect(updatedRun.finishedAt?.toISOString()).toBe(now.toISOString());
  });

  it('fails a stale running sync when its heartbeat is stale', async () => {
    const db = getPrismaClient();
    const now = new Date('2026-04-30T12:00:00.000Z');
    const staleStartedAt = new Date(now.getTime() - STALE_ACTIVE_SYNC_RUN_TIMEOUT_MS - 1_000);
    const staleHeartbeatAt = new Date(now.getTime() - STALE_ACTIVE_SYNC_RUN_TIMEOUT_MS - 1_000);

    const staleRun = await db.syncRun.create({
      data: {
        scopeId,
        trigger: 'manual',
        status: 'running',
        startedAt: staleStartedAt,
      },
    });
    await db.$executeRaw`
      UPDATE "SyncRun"
      SET "updatedAt" = ${staleHeartbeatAt}
      WHERE id = ${staleRun.id}
    `;

    const activeRun = await db.$transaction(async (tx) => {
      await acquireScopeSyncLock(tx, scopeId);
      return resolveActiveSyncRun(tx, workspaceId, scopeId, now);
    });

    expect(activeRun).toBeNull();

    const updatedRun = await db.syncRun.findUniqueOrThrow({ where: { id: staleRun.id } });
    expect(updatedRun.status).toBe('failed');
    expect(updatedRun.errorCode).toBe('SYNC_STALE_TIMEOUT');
    expect(updatedRun.finishedAt?.toISOString()).toBe(now.toISOString());
  });

  it('keeps a running sync active when its heartbeat is fresh', async () => {
    const db = getPrismaClient();
    const now = new Date();
    const staleStartedAt = new Date(now.getTime() - STALE_ACTIVE_SYNC_RUN_TIMEOUT_MS - 1_000);

    const freshRun = await db.syncRun.create({
      data: {
        scopeId,
        trigger: 'manual',
        status: 'running',
        startedAt: staleStartedAt,
      },
    });

    const activeRun = await db.$transaction(async (tx) => {
      await acquireScopeSyncLock(tx, scopeId);
      return resolveActiveSyncRun(tx, workspaceId, scopeId, now);
    });

    expect(activeRun?.id).toBe(freshRun.id);

    const unchangedRun = await db.syncRun.findUniqueOrThrow({ where: { id: freshRun.id } });
    expect(unchangedRun.status).toBe('running');
    expect(unchangedRun.errorCode).toBeNull();
    expect(unchangedRun.finishedAt).toBeNull();
  });
});
