#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const CODE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const EDIT_TOOL_NAMES = new Set([
  'apply_patch',
  'create_file',
  'create_new_jupyter_notebook',
  'edit_notebook_file',
  'editFiles',
  'replace_string_in_file',
]);

main();

function main() {
  const payload = readPayload();

  if (!payload || !EDIT_TOOL_NAMES.has(payload.tool_name)) {
    writeJson({ continue: true });
    return;
  }

  const cwd = payload.cwd || process.cwd();
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

function collectLintableFiles(payload, cwd) {
  const filePaths = new Set();
  const toolInput = payload.tool_input;

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

  return trimmed.startsWith('/') ? trimmed : resolve(cwd, trimmed);
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
      execFileSync(command, command.startsWith('corepack') ? ['pnpm', ...args] : args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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

function packageManagerCommands() {
  if (process.platform === 'win32') {
    return ['corepack.cmd', 'pnpm.cmd'];
  }

  return ['corepack', 'pnpm'];
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
