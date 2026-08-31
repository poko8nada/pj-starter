import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
// lib.mjs は遅延解決（呼び出し時に EVENTS_DIR を読む）のため、同一モジュールのままで
// env を差し替えるだけで双方のディレクトリを扱える。キャッシュ破棄の動的 import は不要
import * as lib from '../../../events/scripts/lib.mjs';
import { PROJECT_ROOT, fail } from './files.mjs';

const valueAt = (trees, key) => {
  const parts = key.split('.');
  let node = trees;
  for (const part of parts) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
};

const componentOf = (key) => key.split('.').slice(0, 3).join('.');

const makeLatestTs = (base, events, trees) => {
  const latest = new Map();
  for (const event of events) latest.set(event.key, event.ts);
  const floor = base.compactedAt ?? '';
  return (key) => latest.get(key) ?? (valueAt(trees, key) !== undefined ? floor : '');
};

const readState = () => {
  const base = lib.loadBase();
  const logPath = lib.LOG_PATH();
  const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
  const { trees, events } = hasLog
    ? lib.foldAll()
    : { trees: structuredClone(base.trees), events: [] };
  return { base, trees, events };
};

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

const componentKeys = (meta) => {
  const keys = [];
  for (const [section, components] of Object.entries(meta ?? {})) {
    for (const id of Object.keys(components ?? {})) keys.push(`meta.${section}.${id}`);
  }
  return keys;
};

const latestStage = (events, trees, comp) => {
  let stage;
  for (const event of events) {
    if (event.type === 'set' && event.key === `${comp}.status`) stage = event.value?.stage;
  }
  return stage ?? valueAt(trees, `${comp}.status`)?.stage;
};

const mergedStages = (project, starter, candidates) => {
  const projectLatest = makeLatestTs(project.base, project.events, project.trees);
  const starterLatest = makeLatestTs(starter.base, starter.events, starter.trees);
  const components = new Set([
    ...componentKeys(project.trees.meta),
    ...componentKeys(starter.trees.meta),
    ...candidates.map((event) => componentOf(event.key)),
  ]);
  const stages = new Map();
  for (const comp of components) {
    const statusKey = `${comp}.status`;
    const winner = projectLatest(statusKey) > starterLatest(statusKey) ? project : starter;
    stages.set(comp, latestStage(winner.events, winner.trees, comp));
  }
  return stages;
};

const decideInjection = (starter, candidates, stages) => {
  const { base, events: starterEvents, trees } = starter;
  const latestTs = makeLatestTs(base, starterEvents, trees);
  const working = structuredClone(trees);
  const pending = [];
  const rows = [];
  for (const event of candidates) {
    const key = event.key;
    const comp = componentOf(key);
    if (stages.get(comp) !== 'commit') {
      rows.push([`KEEP   ${key}  ${event.type}`, '非コミット（プロジェクトに残す）']);
      continue;
    }
    const metaPath = key.slice('meta.'.length);
    const starterTs = latestTs(key);
    if (starterTs !== '' && event.ts <= starterTs) {
      rows.push([
        `SKIP   ${key}  ${event.type}`,
        `project ${event.ts} <= starter ${starterTs}（スターター勝ち）`,
      ]);
      continue;
    }
    if (event.type === 'set') {
      if (lib.stableStringify(valueAt(working, key)) === lib.stableStringify(event.value)) {
        rows.push([`SKIP   ${key}  set`, 'no-op（既に同値）']);
        continue;
      }
      lib.setPath(working.meta, metaPath, event.value);
    } else {
      if (valueAt(working, key) === undefined) {
        rows.push([`SKIP   ${key}  del`, 'no-op（キーなし）']);
        continue;
      }
      lib.deletePath(working.meta, metaPath);
    }
    pending.push(event);
    rows.push([
      `INJECT ${key}  ${event.type}`,
      `project ${event.ts} > starter ${starterTs || '記録なし'}`,
    ]);
  }
  return { pending, rows, working };
};

const committedInventory = (working, stages) => {
  const inventory = {};
  for (const [comp, stage] of stages) {
    if (stage !== 'commit') continue;
    const [, section, id] = comp.split('.');
    const node = working.meta?.[section]?.[id];
    if (node) (inventory[section] ??= {})[id] = node;
  }
  return inventory;
};

const stripProjectLog = (logPath, stages, run) => {
  const lines = fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.key.startsWith('meta.') && stages.get(componentOf(event.key)) === 'commit') removed++;
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

export const syncMeta = async (starterRoot, run) => {
  const projectEventsDir = path.join(PROJECT_ROOT, 'events');
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

  // 遅延解決のため呼び出し前に env を差し替える。終了時は元の値へ復元する
  const prevEventsDir = process.env.EVENTS_DIR;
  try {
    process.env.EVENTS_DIR = projectEventsDir;
    const candidates = readCandidates(projectLogPath);
    const project = readState();
    process.env.EVENTS_DIR = starterEventsDir;
    const starter = readState();

    const stages = mergedStages(project, starter, candidates);
    const { pending, rows, working } = decideInjection(starter, candidates, stages);

    console.log(`[meta] meta.* イベント ${candidates.length} 件の勝敗判定`);
    for (const [verdict, detail] of rows) console.log(`  ${verdict.padEnd(54)} ${detail}`);
    console.log(
      `[meta] ${pending.length} 件をスターターへ注入 / ${candidates.length - pending.length} 件スキップ`,
    );

    const inventory = committedInventory(working, stages);
    const stripped = lib.stripHistory(inventory);
    const removed = stripProjectLog(projectLogPath, stages, run);
    const unitCount = Object.values(stripped).reduce(
      (sum, section) => sum + Object.keys(section).length,
      0,
    );
    console.log(
      `[strip] プロジェクト側: checkpoint をコミット済み在庫（${unitCount} unit）で書き換え、ログからコミット済みイベント ${removed} 件を除去`,
    );

    if (!run) {
      console.log('[dry-run] --run で実コピーと注入');
      return;
    }

    if (pending.length > 0) {
      fs.appendFileSync(
        path.join(starterEventsDir, 'log.jsonl'),
        `${pending.map((event) => JSON.stringify(event)).join('\n')}\n`,
      );
      console.log(`[meta] ${pending.length} 件を ${starterEventsDir}/log.jsonl へ追記`);
    }

    // 書き込みは project 側の env に戻してから行う
    process.env.EVENTS_DIR = projectEventsDir;
    lib.writeCheckpoint({ product: project.trees.product, meta: stripped });
    console.log('[strip] プロジェクト側の checkpoint を書き換えました');

    build(PROJECT_ROOT, projectEventsDir);
    build(starterRoot, starterEventsDir);
  } finally {
    if (prevEventsDir === undefined) delete process.env.EVENTS_DIR;
    else process.env.EVENTS_DIR = prevEventsDir;
  }
};
