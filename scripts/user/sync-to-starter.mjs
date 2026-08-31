#!/usr/bin/env node
// ハーネスをプロジェクトとスターター間で双方向同期する。ファイルは rclone bisync、meta.* ログはコミット済みのみ双方向へ流し、プロジェクト側は reset 同様にストリップする。
// 引数なしは使い方表示、<path> はプレビュー、--run <path> で実行。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = 'usage: node scripts/user/sync-to-starter.mjs [--run] <スターターのパス>';

// 同期単位。bisync はディレクトリのみ対応のため、単一ファイルは親ディレクトリ + --filter で扱う。
// filter は毎回同一である必要がある（変更検知で abort するため）
const SYNC_UNITS = [
  { label: 'harness', paths: ['.opencode/lib', '.opencode/plugin'] },
  { label: 'agents', paths: ['.opencode/agent'] },
  { label: 'skills', paths: ['.opencode/skills'] },
  {
    label: 'config',
    paths: ['.opencode'],
    filter: ['+ tsconfig.json', '+ package.json', '+ .gitignore', '- *'],
  },
  { label: 'scripts', paths: ['scripts'] },
  {
    label: 'events',
    paths: ['events'],
    excludes: ['log.jsonl', 'checkpoint.json', 'snapshots/**'],
  },
  { label: 'docs', paths: ['.'], filter: ['+ AGENTS.md', '+ lefthook.yaml', '- *'] },
];
// ディレクトリ単位に適用する共通除外。lock は生成物なので運ばない
const COMMON_EXCLUDES = [
  'node_modules/**',
  '**/.DS_Store',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
];

const fail = (message) => {
  console.error(`error: ${message}`);
  console.error(USAGE);
  process.exit(1);
};

// lib.mjs は node 組み込みのみを import するため、キャッシュ破棄は lib 単体で完結する
let libSeq = 0;

const parseArgs = (argv) => {
  const run = argv.includes('--run');
  const rest = argv.filter((arg) => arg !== '--run');
  if (rest.length > 1) fail('too many arguments');
  return { run, starterDir: rest[0] };
};

const checkRclone = () => {
  const probe = spawnSync('rclone', ['version'], { encoding: 'utf8' });
  if (probe.error) fail('rclone が見つかりません。インストールしてから実行してください');
};

// bisync の引数を組み立てる。フィルタ単位は --filter、ディレクトリ単位は --exclude
const bisyncArgs = (unit, src, dst, preview) => {
  const args = ['bisync', src, dst];
  if (unit.filter) for (const pattern of unit.filter) args.push('--filter', pattern);
  else {
    for (const pattern of COMMON_EXCLUDES) args.push('--exclude', pattern);
    for (const pattern of unit.excludes ?? []) args.push('--exclude', pattern);
  }
  if (preview) args.push('--dry-run');
  return args;
};

// bisync を実行する。初回（状態なし）は "Must run --resync" で abort するため、そのエラーを検知して --resync --resync-mode newer で再試行する。
// 文言は rclone の実装依存（v1.75 で確認）。安全 abort（全件変更など）では再試行しない
const runBisync = (unit, src, dst, preview) => {
  const baseArgs = bisyncArgs(unit, src, dst, preview);
  const first = spawnSync('rclone', baseArgs, { encoding: 'utf8' });
  const output = first.stdout + first.stderr;
  if (first.status === 0) return { ok: true, output };
  if (output.includes('Must run --resync')) {
    const retry = spawnSync('rclone', [...baseArgs, '--resync', '--resync-mode', 'newer'], {
      encoding: 'utf8',
    });
    return { ok: retry.status === 0, output: retry.stdout + retry.stderr };
  }
  return { ok: false, output };
};

// ドットパスで木の値を取得する。途中が欠けていれば undefined
const valueAt = (trees, key) => {
  const parts = key.split('.');
  let node = trees;
  for (const part of parts) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
};

// キーからコンポーネント（meta.<section>.<id>）を取り出す
const componentOf = (key) => key.split('.').slice(0, 3).join('.');

// 一方の「キーごとの最終タッチ ts」を返す関数を作る。
// ログで触れたキーはその ts、checkpoint 由来のキーは compactedAt を下限、未存在キーは ''（常に相手勝ち）
const makeLatestTs = (base, events, trees) => {
  const latest = new Map();
  for (const event of events) latest.set(event.key, event.ts);
  const floor = base.compactedAt ?? '';
  return (key) => latest.get(key) ?? (valueAt(trees, key) !== undefined ? floor : '');
};

// EVENTS_DIR を差し替えて lib を読み込む。クエリでモジュールキャッシュを無効化する
const loadLib = async (eventsDir) => {
  const prevEventsDir = process.env.EVENTS_DIR;
  process.env.EVENTS_DIR = eventsDir;
  const libUrl = new URL('../../events/scripts/lib.mjs', import.meta.url).href;
  const lib = await import(`${libUrl}?t=${++libSeq}`);
  return { lib, prevEventsDir };
};

// 一方の状態（checkpoint + ログ）を畳んで返す。ログが無い・空なら checkpoint のみ
const readState = (lib) => {
  const base = lib.loadBase();
  const logPath = path.join(lib.EVENTS_DIR, 'log.jsonl');
  const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
  const { trees, events } = hasLog
    ? lib.foldAll()
    : { trees: structuredClone(base.trees), events: [] };
  return { base, trees, events };
};

// プロジェクトのログから meta.* イベントを抽出し、キー文法・status 形状を検証して返す
const readCandidates = (lib, projectLogPath) => {
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
      // キー文法・status 形状を検証してから候補に加える
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

// meta ツリーからコンポーネントキー（meta.<section>.<id>）を列挙する
const componentKeys = (meta) => {
  const keys = [];
  for (const [section, components] of Object.entries(meta ?? {})) {
    for (const id of Object.keys(components ?? {})) keys.push(`meta.${section}.${id}`);
  }
  return keys;
};

// 片側の「コンポーネントの最終 status 主張」を返す。
// ログの status set をファイル順で走査し、最後の stage を返す。
// イベントが無ければ checkpoint 由来の status を使う（削除済みコンポーネントも最後の主張を引き継ぐ）
const latestStage = (events, trees, comp) => {
  let stage;
  for (const event of events) {
    if (event.type === 'set' && event.key === `${comp}.status`) stage = event.value?.stage;
  }
  return stage ?? valueAt(trees, `${comp}.status`)?.stage;
};

// コンポーネントごとのマージ stage を判定する。
// 両側の status の最新 ts を比較し、新しい方の stage をマージ stage とする。
// 削除済みコンポーネントはツリーに残らないため、候補イベントのコンポーネントも対象に含める
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

// 候補イベントの勝敗を判定する。コミット済みコンポーネントのみ注入対象。
// 非コミットは KEEP（プロジェクトに残す）。working は注入済みを反映した作業ツリーで、no-op 判定を逐次正しく行う
const decideInjection = (lib, starter, candidates, stages) => {
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
    // 等 ts はスターター勝ち（タイブレーク）。同 ts は同一バッチ由来が稀なため
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

// コミット済みコンポーネントのマージ定義を在庫として抽出する
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

// プロジェクトのログからコミット済みコンポーネントのイベントを除去する。
// 除去件数を返す（dry-run では書き込まない）
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

// 両側で build を実行する
const build = (root, eventsDir) => {
  const result = spawnSync('node', ['events/scripts/build.mjs'], {
    cwd: root,
    env: { ...process.env, EVENTS_DIR: eventsDir },
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('build が失敗しました');
};

// meta.* の双方向フロー。コミット済みのみスターターへ注入し、プロジェクト側をストリップする
const syncMeta = async (starterRoot, run) => {
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

  // 両側の状態を畳むため EVENTS_DIR を差し替えて lib を読み込む。
  // プロジェクトのログは readCandidates で先に検証する（foldAll は不正行で落ちるため）
  const { lib: projectLib, prevEventsDir } = await loadLib(projectEventsDir);
  const candidates = readCandidates(projectLib, projectLogPath);
  const project = readState(projectLib);
  const { lib: starterLib } = await loadLib(starterEventsDir);
  const starter = readState(starterLib);
  if (prevEventsDir === undefined) delete process.env.EVENTS_DIR;
  else process.env.EVENTS_DIR = prevEventsDir;

  const stages = mergedStages(project, starter, candidates);
  const { pending, rows, working } = decideInjection(starterLib, starter, candidates, stages);

  console.log(`[meta] meta.* イベント ${candidates.length} 件の勝敗判定`);
  for (const [verdict, detail] of rows) console.log(`  ${verdict.padEnd(54)} ${detail}`);
  console.log(
    `[meta] ${pending.length} 件をスターターへ注入 / ${candidates.length - pending.length} 件スキップ`,
  );

  const inventory = committedInventory(working, stages);
  const stripped = projectLib.stripHistory(inventory);
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

  projectLib.writeCheckpoint({ product: project.trees.product, meta: stripped });
  console.log('[strip] プロジェクト側の checkpoint を書き換えました');

  build(PROJECT_ROOT, projectEventsDir);
  build(starterRoot, starterEventsDir);
};

const main = async () => {
  const { run, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('同期対象:');
    for (const unit of SYNC_UNITS) console.log(`  ${unit.label}: ${unit.paths.join(', ')}`);
    console.log(`除外: ${COMMON_EXCLUDES.join(' / ')}`);
    console.log(
      '加えて meta.* はコミット済みのみ双方向へ流し、プロジェクト側を reset 同様にストリップする',
    );
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つからない: ${starterRoot}`);
  checkRclone();

  let failed = false;
  for (const unit of SYNC_UNITS) {
    for (const unitPath of unit.paths) {
      const src = path.join(PROJECT_ROOT, unitPath);
      const dst = path.join(starterRoot, unitPath);
      if (!fs.existsSync(src) || !fs.existsSync(dst)) {
        console.log(`skip (not found): ${unitPath}`);
        continue;
      }
      const result = runBisync(unit, src, dst, !run);
      process.stdout.write(result.output);
      if (!result.ok) failed = true;
    }
  }
  if (failed) fail('bisync が一部の対象で失敗しました（安全 abort は手動解決が必要）');

  await syncMeta(starterRoot, run);

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }
  console.log(
    '同期完了。スターター側の meta.json は build で更新済み。残りの記録（status 主張 → commit）はスターター側の通常フローで行うこと',
  );
};

void main();
