#!/usr/bin/env node
// spike-worktree.mjs — create/cleanup spike verification worktrees.
// 検証用 worktree をプロジェクト内 .worktrees/ に作成し、不要なディレクトリを除去する。
// サブエージェント (spike-verifier) はこのスクリプトだけを使って worktree を操作する。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../../../..');

// 検証に不要なディレクトリ。worktree 作成後に除去する
const REMOVE_DIRS = [
  '.opencode',
  'events',
  'scripts',
  'node_modules',
  '.github',
  '.cursor',
  '.vscode',
];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function validateLibName(libName) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(libName))
    throw new Error(`invalid lib-name: ${libName} (use lowercase letters, digits, hyphens)`);
}

function create(libName) {
  validateLibName(libName);
  const worktreeRel = `.worktrees/spike-${libName}`;
  const worktreePath = path.join(root, worktreeRel);
  if (fs.existsSync(worktreePath)) throw new Error(`worktree already exists: ${worktreeRel}`);

  git(['worktree', 'add', worktreeRel, '-b', `spike/${libName}`], root);
  for (const dir of REMOVE_DIRS) {
    const target = path.join(worktreePath, dir);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }
  console.log(`worktree ready: ${worktreeRel}`);
}

function cleanup(libName) {
  validateLibName(libName);
  const worktreeRel = `.worktrees/spike-${libName}`;
  const statusBefore = git(['status', '--porcelain'], root);
  git(['worktree', 'remove', '--force', worktreeRel], root);
  git(['branch', '-D', `spike/${libName}`], root);
  const list = git(['worktree', 'list'], root);
  if (list.includes(`spike-${libName}`))
    throw new Error(`spike worktree still exists: ${worktreeRel}`);

  const statusAfter = git(['status', '--porcelain'], root);
  if (statusAfter !== statusBefore)
    throw new Error(`main project changed during spike: ${statusAfter}`);

  console.log('cleanup complete');
}

const [mode, libName] = process.argv.slice(2);
if (!mode || !libName) {
  console.error('Usage: node spike-worktree.mjs <create|cleanup> <lib-name>');
  process.exit(1);
}

try {
  if (mode === 'create') create(libName);
  else if (mode === 'cleanup') cleanup(libName);
  else {
    console.error(`unknown mode: ${mode} (use create or cleanup)`);
    process.exit(1);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
