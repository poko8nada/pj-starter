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

const DEFAULT_NAME = 'プロジェクト名が入ります';
const WHAT_TEXT = '今からプロジェクトを作り始める段階です';

// --init 用の初期化。checkpoint を product.stack + stripped meta に書き換え、ログを空にして name/what で再開し、README を削除する
const initProject = (run, trees, stripped, eventsDir) => {
  const stack = trees.product?.stack ?? {};
  const stackKeys = Object.keys(stack).length;
  const unitCount = Object.values(stripped).reduce(
    (sum, section) => sum + Object.keys(section).length,
    0,
  );

  const readmeFiles = ['README.md', 'README.ja.md'].map((file) => path.join(PROJECT_ROOT(), file));
  const logPath = lib.LOG_PATH();
  const logLines = fs.existsSync(logPath)
    ? fs
        .readFileSync(logPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '').length
    : 0;

  console.log(
    `削除: ${path.relative(PROJECT_ROOT(), lib.CHECKPOINT_PATH())} / README.md / README.ja.md`,
  );
  console.log(`log: ${logLines} 行を初期化し、name/what の 2 イベントをアペンド`);
  console.log(`checkpoint 種まき: stack ${stackKeys} キー / meta ${unitCount} unit`);
  console.log(`名前: ${DEFAULT_NAME}`);
  console.log('最後に build でスナップショットを再生成');

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }

  for (const file of [lib.CHECKPOINT_PATH(), ...readmeFiles]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  fs.writeFileSync(logPath, '');
  lib.writeCheckpoint({ product: { stack: lib.stripHistory(stack) }, meta: stripped });
  const ts = lib.jstNow();
  const events = [
    lib.buildEvent({ type: 'set', key: 'product.name.value', value: DEFAULT_NAME }, ts),
    lib.buildEvent({ type: 'set', key: 'product.what.value', value: WHAT_TEXT }, ts),
  ];
  fs.appendFileSync(logPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  build(PROJECT_ROOT(), eventsDir);
  console.log('init 完了');
};

export const applyMeta = async (starterRoot, run, init) => {
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

    if (init) {
      initProject(run, project.trees, stripped, projectEventsDir);
      return;
    }

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
