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
const jiraPort = env.JIRA_PORT || '8080';
const jiraPublicUrl = env.JIRA_BOOTSTRAP_PUBLIC_BASE_URL || `http://localhost:${jiraPort}`;
const agileToolsUrl = env.AGILE_TOOLS_URL || 'http://localhost:3000';
const agileToolsRuntime = detectAgileToolsRuntime(repoRoot);
const bootstrap = existsSync(bootstrapPath)
  ? JSON.parse(readFileSync(bootstrapPath, 'utf8'))
  : null;
const bootstrapBaseUrl = bootstrap?.agileToolsConnection?.baseUrl || jiraPublicUrl;
const recommendedJiraBaseUrl =
  env.AGILE_TOOLS_JIRA_BASE_URL || resolveAgileToolsJiraBaseUrl(bootstrapBaseUrl, agileToolsRuntime);

const output = {
  repoRoot,
  helpers: {
    resetLocalJiraStack: 'node docker/reset-local-jira-stack.mjs',
    resolveLatestScopeUrl:
      'node .agents/skills/jira-local-browser-setup/scripts/resolve-local-scope-url.mjs',
  },
  localAdmin: {
    workspaceId: LOCAL_ADMIN_WORKSPACE_ID,
  },
  paths: {
    env: envPath,
    bootstrapSummary: bootstrapPath,
  },
  jira: {
    port: Number(jiraPort),
    publicUrl: jiraPublicUrl,
    username: env.JIRA_BOOTSTRAP_USERNAME || null,
    password: env.JIRA_BOOTSTRAP_PASSWORD || null,
    setup: {
      adminDisplayName:
        env.JIRA_SETUP_ADMIN_DISPLAY_NAME || 'Agile Tools Local Admin',
      adminEmail:
        env.JIRA_SETUP_ADMIN_EMAIL ||
        buildDefaultAdminEmail(env.JIRA_BOOTSTRAP_USERNAME || 'admin'),
      applicationTitle:
        env.JIRA_SETUP_APPLICATION_TITLE || 'Agile Tools Local Jira',
      baseUrl: env.JIRA_SETUP_BASE_URL || jiraPublicUrl,
      licenseKey: env.JIRA_SETUP_LICENSE_KEY || null,
      mode: normalizeJiraMode(env.JIRA_SETUP_MODE || 'private'),
    },
  },
  agileTools: {
    baseUrl: agileToolsUrl,
    adminPath: '/admin/jira',
    recommendedJiraBaseUrl,
    runtime: agileToolsRuntime,
  },
  bootstrap,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

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

function buildDefaultAdminEmail(username) {
  const safeUsername = username.replace(/[^a-z0-9._-]+/giu, '-');
  return `${safeUsername}@example.test`;
}

function detectAgileToolsRuntime(cwd) {
  try {
    const output = execFileSync(
      'docker',
      ['compose', 'ps', '--services', '--status', 'running'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    const services = output
      .split(/\r?\n/u)
      .map((service) => service.trim())
      .filter(Boolean);

    return services.includes('web') ? 'docker' : 'host';
  } catch {
    return 'host';
  }
}

function resolveAgileToolsJiraBaseUrl(value, runtime) {
  try {
    const url = new URL(value);

    if (runtime === 'docker' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.hostname = 'host.docker.internal';
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function normalizeJiraMode(value) {
  return value.trim().toLowerCase() === 'public' ? 'public' : 'private';
}