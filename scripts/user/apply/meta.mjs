// meta.* の適用。スターターのコミット済み在庫（status/updatedAt 除去）でプロジェクトの meta を丸ごと置換し、プロジェクトのログからコミット済み meta イベントを除去する。双方向の勝敗判定は行わない（スターターが正）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
// lib.mjs は遅延解決（呼び出し時に EVENTS_DIR を読む）のため、同一モジュールのままでenv を差し替えるだけで双方のディレクトリを扱える。キャッシュ破棄の動的 import は不要
import * as lib from '../../../events/scripts/lib.mjs';
import { PROJECT_ROOT, fail } from './files.mjs';

const readState = () => {
  const base = lib.loadBase();
  const logPath = lib.LOG_PATH();
  const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
  const { trees, events } = hasLog
    ? lib.foldAll()
    : { trees: structuredClone(base.trees), events: [] };
  return { base, trees, events };
};

const componentOf = (key) => key.split('.').slice(0, 3).join('.');

// プロジェクトのログから meta.* イベントを検証しつつ抽出する
const readCandidates = (projectLogPath) => {
  const candidates = [];
  const lines = fs
    .readFileSync(projectLogPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      fail(`プロジェクトのログに不正な行があります (line ${index + 1})`);
    }
    if (event.key?.startsWith('meta.')) {
      try {
        lib.buildEvent({ type: event.type, key: event.key, value: event.value }, event.ts);
      } catch (error) {
        fail(`プロジェクトのログに不正なイベントがあります (line ${index + 1}): ${error.message}`);
      }
      candidates.push(event);
    }
  }
  return candidates;
};

// スターターのコミット済みコンポーネントのみを在庫として抽出する
const committedInventory = (trees) => {
  const inventory = {};
  for (const [section, components] of Object.entries(trees.meta ?? {})) {
    for (const [id, node] of Object.entries(components ?? {})) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      if (node.status?.stage !== 'commit') continue;
      (inventory[section] ??= {})[id] = node;
    }
  }
  return inventory;
};

// プロジェクトのログからコミット済みコンポーネントのイベントを除去する
const stripProjectLog = (logPath, events, run) => {
  const stages = new Set();
  for (const event of events) {
    if (event.key.startsWith('meta.') && event.value?.stage === 'commit') {
      stages.add(componentOf(event.key));
    }
  }
  const lines = fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      // 非 meta 行（log.try.* 等）は対象外なのでそのまま残す
      kept.push(line);
      continue;
    }
    if (event.key.startsWith('meta.') && stages.has(componentOf(event.key))) removed++;
    else kept.push(line);
  }
  if (run) fs.writeFileSync(logPath, kept.length > 0 ? `${kept.join('\n')}\n` : '');
  return removed;
};

const build = (root, eventsDir) => {
  const result = spawnSync('node', ['events/scripts/build.mjs'], {
    cwd: root,
    env: { ...process.env, EVENTS_DIR: eventsDir },
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('build が失敗しました');
};

export const applyMeta = async (starterRoot, run) => {
  const projectEventsDir = path.join(PROJECT_ROOT(), 'events');
  const starterEventsDir = path.join(starterRoot, 'events');
  const projectLogPath = path.join(projectEventsDir, 'log.jsonl');
  if (!fs.existsSync(projectLogPath)) {
    console.log('[meta] skip: プロジェクトに events/log.jsonl がない');
    return;
  }
  if (!fs.existsSync(starterEventsDir)) {
    console.log('[meta] skip: スターターに events/ がない');
    return;
  }

  const prevEventsDir = process.env.EVENTS_DIR;
  try {
    process.env.EVENTS_DIR = starterEventsDir;
    const starter = readState();
    process.env.EVENTS_DIR = projectEventsDir;
    const project = readState();

    const inventory = committedInventory(starter.trees);
    const stripped = lib.stripHistory(inventory);
    const unitCount = Object.values(stripped).reduce(
      (sum, section) => sum + Object.keys(section).length,
      0,
    );
    console.log(`[meta] スターターのコミット済み在庫 ${unitCount} unit で置換`);

    const candidates = readCandidates(projectLogPath);
    const removed = stripProjectLog(projectLogPath, candidates, run);
    console.log(`[strip] プロジェクトのログからコミット済み meta イベント ${removed} 件を除去`);

    if (!run) {
      console.log('[dry-run] --run で実コピーと注入');
      return;
    }

    process.env.EVENTS_DIR = projectEventsDir;
    lib.writeCheckpoint({ product: project.trees.product, meta: stripped });
    console.log('[strip] プロジェクトの checkpoint を書き換えました');

    build(PROJECT_ROOT(), projectEventsDir);
  } finally {
    if (prevEventsDir === undefined) delete process.env.EVENTS_DIR;
    else process.env.EVENTS_DIR = prevEventsDir;
  }
};
