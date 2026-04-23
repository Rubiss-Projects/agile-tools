#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_ADMIN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000011';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const jiraComposeFile = resolve(repoRoot, 'docker-compose.jira.yml');
const jiraLocalDir = resolve(repoRoot, '.jira-local');

const options = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (options.help) {
    process.stdout.write(`${usage()}`);
    return;
  }

  const summary = {
    jiraComposeFile,
    removedBootstrapOutput: false,
    resetAgileToolsAdmin: null,
    startedJiraStack: false,
    dryRun: options.dryRun,
  };

  runJiraCompose(['down', '-v', '--remove-orphans']);

  if (options.dryRun) {
    console.log(`[dry-run] rm -rf ${jiraLocalDir}`);
    console.log(`[dry-run] mkdir -p ${jiraLocalDir}`);
  } else {
    await rm(jiraLocalDir, { force: true, recursive: true });
    await mkdir(jiraLocalDir, { recursive: true });
  }

  summary.removedBootstrapOutput = true;
  summary.resetAgileToolsAdmin = await resetLocalAdminState();

  if (options.start) {
    runJiraCompose(['up', '-d']);
    summary.startedJiraStack = true;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    help: false,
    start: true,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--no-start') {
      parsed.start = false;
      continue;
    }

    if (arg === '--start') {
      parsed.start = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function usage() {
  return [
    'Usage: node docker/reset-local-jira-stack.mjs [--dry-run] [--no-start]',
    '',
    'Resets the local Jira compose stack by removing the Jira database and home volumes,',
    'clearing generated bootstrap output, and optionally restarting the stack.',
    '',
    'When the main Agile Tools web container is running, this also clears the local-admin',
    'workspace Jira connections and flow scopes so the browser setup flow starts cleanly.',
    '',
    'Options:',
    '  --dry-run   Print the commands without making changes',
    '  --no-start  Leave the Jira stack stopped after the reset',
    '  --help      Show this message',
    '',
  ].join('\n');
}

function runJiraCompose(args) {
  if (options.dryRun) {
    console.log(`[dry-run] docker compose -f ${jiraComposeFile} ${args.join(' ')}`);
    return;
  }

  execFileSync('docker', ['compose', '-f', jiraComposeFile, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

async function resetLocalAdminState() {
  const webContainerId = captureOutput('docker', ['compose', 'ps', '-q', 'web']).trim();

  if (!webContainerId) {
    return {
      status: 'skipped',
      reason: 'Agile Tools web container is not running',
      workspaceId: LOCAL_ADMIN_WORKSPACE_ID,
    };
  }

  const inlineScript = [
    "import { disconnectPrisma, getPrismaClient } from '/app/packages/db/dist/index.js';",
    `const workspaceId = ${JSON.stringify(LOCAL_ADMIN_WORKSPACE_ID)};`,
    'const db = getPrismaClient();',
    'const [deletedFlowScopes, deletedJiraConnections] = await Promise.all([',
    '  db.flowScope.deleteMany({ where: { workspaceId } }),',
    '  db.jiraConnection.deleteMany({ where: { workspaceId } }),',
    ']);',
    'console.log(JSON.stringify({',
    "  status: 'reset',",
    '  workspaceId,',
    '  deletedFlowScopes: deletedFlowScopes.count,',
    '  deletedJiraConnections: deletedJiraConnections.count,',
    '}));',
    'await disconnectPrisma();',
  ].join(' ');

  if (options.dryRun) {
    console.log('[dry-run] docker compose exec -T web node --input-type=module -e <local-admin-reset>');
    return {
      status: 'dry-run',
      workspaceId: LOCAL_ADMIN_WORKSPACE_ID,
    };
  }

  try {
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

    return parseLastJsonLine(output);
  } catch (error) {
    return {
      status: 'warning',
      reason: error instanceof Error ? error.message : String(error),
      workspaceId: LOCAL_ADMIN_WORKSPACE_ID,
    };
  }
}

function captureOutput(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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

  throw new Error('Failed to parse reset output from Agile Tools web container');
}