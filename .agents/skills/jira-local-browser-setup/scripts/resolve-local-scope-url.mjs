#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_ADMIN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000011';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../../../');
const envPath = resolve(repoRoot, '.env');
const bootstrapPath = resolve(repoRoot, '.jira-local/jira-bootstrap.json');

const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const bootstrap = existsSync(bootstrapPath)
  ? JSON.parse(readFileSync(bootstrapPath, 'utf8'))
  : null;
const agileToolsUrl = normalizeUrl(env.AGILE_TOOLS_URL || 'http://localhost:3000');
const preferredBoardId =
  String(bootstrap?.agileToolsConnection?.boardId || bootstrap?.board?.id || '').trim() || null;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const scope = findLatestScope(preferredBoardId);

  if (!scope) {
    throw new Error(
      `No flow scope found for local admin workspace ${LOCAL_ADMIN_WORKSPACE_ID}`,
    );
  }

  const output = {
    workspaceId: LOCAL_ADMIN_WORKSPACE_ID,
    preferredBoardId,
    scope,
    url: `${agileToolsUrl}/scopes/${scope.id}`,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function findLatestScope(boardId) {
  const webContainerId = captureOutput('docker', ['compose', 'ps', '-q', 'web']).trim();

  if (!webContainerId) {
    throw new Error('Agile Tools web container is not running');
  }

  const inlineScript = [
    "import { disconnectPrisma, getPrismaClient } from '/app/packages/db/dist/index.js';",
    `const workspaceId = ${JSON.stringify(LOCAL_ADMIN_WORKSPACE_ID)};`,
    `const preferredBoardId = ${boardId ? JSON.stringify(boardId) : 'null'};`,
    'const db = getPrismaClient();',
    'const select = {',
    '  id: true,',
    '  boardId: true,',
    '  boardName: true,',
    '  status: true,',
    '  createdAt: true,',
    '  updatedAt: true,',
    '};',
    'let scope = await db.flowScope.findFirst({',
    '  where: preferredBoardId ? { workspaceId, boardId: preferredBoardId } : { workspaceId },',
    "  orderBy: { createdAt: 'desc' },",
    '  select,',
    '});',
    'if (!scope && preferredBoardId) {',
    '  scope = await db.flowScope.findFirst({',
    '    where: { workspaceId },',
    "    orderBy: { createdAt: 'desc' },",
    '    select,',
    '  });',
    '}',
    'console.log(JSON.stringify(scope));',
    'await disconnectPrisma();',
  ].join(' ');

  const output = captureOutput('docker', [
    'compose',
    'exec',
    '-T',
    'web',
    'node',
    '--input-type=module',
    '-e',
    inlineScript,
  ]);

  const scope = parseLastJsonLine(output);
  return scope && typeof scope === 'object' ? scope : null;
}

function captureOutput(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseEnv(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function parseLastJsonLine(output) {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      continue;
    }
  }

  throw new Error('Failed to parse scope lookup output');
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, '');
}