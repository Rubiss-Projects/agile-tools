#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const CODE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const EDIT_TOOL_NAMES = new Set([
  'apply_patch',
  'Edit',
  'Write',
  'create_file',
  'create_new_jupyter_notebook',
  'edit_notebook_file',
  'editFiles',
  'replace_string_in_file',
]);

main();

function main() {
  const payload = readPayload();
  const toolName = getToolName(payload);

  if (!payload || (toolName && !EDIT_TOOL_NAMES.has(toolName))) {
    writeJson({ continue: true });
    return;
  }

  const cwd = getCwd(payload);
  const files = collectLintableFiles(payload, cwd);

  if (files.length === 0) {
    writeJson({ continue: true });
    return;
  }

  try {
    runEslint(files, cwd);
    writeJson({ continue: true });
  } catch (error) {
    writeJson({
      decision: 'block',
      reason: 'Post-edit ESLint validation failed.',
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: formatFailure(error, files, cwd),
      },
      systemMessage: 'Post-edit ESLint validation failed.',
    });
  }
}

function readPayload() {
  try {
    const input = readFileSync(0, 'utf8').trim();
    return input ? JSON.parse(input) : null;
  } catch {
    return null;
  }
}

function getToolName(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.tool_name ?? payload.toolName ?? payload.tool?.name ?? payload.name ?? null;
}

function getToolInput(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.tool_input ?? payload.toolInput ?? payload.input ?? payload.arguments ?? payload.tool?.input ?? null;
}

function getCwd(payload) {
  const configuredCwd = payload && typeof payload === 'object' ? payload.cwd ?? payload.session?.cwd : null;
  const candidate = typeof configuredCwd === 'string' && configuredCwd ? configuredCwd : process.cwd();

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: candidate,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return candidate;
  }
}

function collectLintableFiles(payload, cwd) {
  const filePaths = new Set();
  const toolInput = getToolInput(payload);

  for (const candidate of extractCandidates(toolInput)) {
    const normalizedPath = normalizeFilePath(candidate, cwd);

    if (!normalizedPath || !existsSync(normalizedPath)) {
      continue;
    }

    if (!CODE_EXTENSIONS.has(extname(normalizedPath))) {
      continue;
    }

    filePaths.add(normalizedPath);
  }

  return [...filePaths];
}

function extractCandidates(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return [];
  }

  const candidates = [];

  if (typeof toolInput.filePath === 'string') {
    candidates.push(toolInput.filePath);
  }

  if (typeof toolInput.file_path === 'string') {
    candidates.push(toolInput.file_path);
  }

  if (typeof toolInput.path === 'string') {
    candidates.push(toolInput.path);
  }

  if (Array.isArray(toolInput.files)) {
    for (const file of toolInput.files) {
      if (typeof file === 'string') {
        candidates.push(file);
        continue;
      }

      if (file && typeof file === 'object') {
        if (typeof file.filePath === 'string') {
          candidates.push(file.filePath);
        }

        if (typeof file.file_path === 'string') {
          candidates.push(file.file_path);
        }

        if (typeof file.path === 'string') {
          candidates.push(file.path);
        }
      }
    }
  }

  if (typeof toolInput.input === 'string') {
    candidates.push(...extractPathsFromPatch(toolInput.input));
  }

  return candidates;
}

function extractPathsFromPatch(patch) {
  const paths = [];

  for (const rawLine of patch.split(/\r?\n/u)) {
    const match = rawLine.match(/^\*\*\* (?:Add|Update) File: (.+)$/u);

    if (!match) {
      continue;
    }

    const [path] = match[1].split(' -> ');
    paths.push(path.trim());
  }

  return paths;
}

function normalizeFilePath(filePath, cwd) {
  if (typeof filePath !== 'string') {
    return null;
  }

  const trimmed = filePath.trim();

  if (!trimmed || trimmed.startsWith('untitled:')) {
    return null;
  }

  return /^[a-zA-Z]:[\\/]/u.test(trimmed) || trimmed.startsWith('/') ? trimmed : resolve(cwd, trimmed);
}

function runEslint(files, cwd) {
  const relativeFiles = files
    .map((filePath) => relative(cwd, filePath))
    .filter((filePath) => filePath && !filePath.startsWith('..'));

  if (relativeFiles.length === 0) {
    return;
  }

  const args = ['exec', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...relativeFiles];

  for (const command of packageManagerCommands()) {
    try {
      invokePackageManager(command, command.startsWith('corepack') ? ['pnpm', ...args] : args, cwd);
      return;
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Unable to locate pnpm or corepack to run ESLint');
}

function invokePackageManager(command, args, cwd) {
  const options = {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  if (process.platform === 'win32' && command.endsWith('.cmd')) {
    execFileSync('cmd.exe', ['/d', '/s', '/c', command, ...args], options);
    return;
  }

  execFileSync(command, args, options);
}

function packageManagerCommands() {
  if (process.platform === 'win32') {
    return ['pnpm.cmd', 'corepack.cmd'];
  }

  return ['pnpm', 'corepack'];
}

function formatFailure(error, files, cwd) {
  const relativeFiles = files.map((filePath) => relative(cwd, filePath));
  const stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout || '') : '';
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr || '') : '';
  const combinedOutput = `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-40)
    .join('\n');

  return [
    `ESLint failed for edited files: ${relativeFiles.join(', ')}`,
    combinedOutput || 'No ESLint output was captured.',
  ].join('\n\n');
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
