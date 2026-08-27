#!/usr/bin/env node
// ハーネスをプロジェクトからスターターへ丸ごと同期する。選別ロジックなし、復元はユーザー手動。
// events の状態ファイル（checkpoint / snapshots）はコピー対象外。meta.* のログイベントのみ、キー単位の ts 比較で勝者を決めてスターターの log.jsonl へ注入し、スターター側で build を実行する。
// 引数なしは使い方表示、<path> はプレビュー、--run <path> で実行。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = 'usage: node scripts/user/sync-to-starter.mjs [--run] <スターターのパス>';

// コピー対象。events の状態ファイル（checkpoint / snapshots / log）は含めない。
// log は meta.* イベントの注入ステップ（injectMetaEvents）で別途扱う。
// lock は生成物なので運ばない。package.json を同期したら受取側の次回起動で依存が解決される
const TARGETS = [
  '.opencode',
  'scripts',
  'AGENTS.md',
  'lefthook.yaml',
  'events/README.md',
  'events/spec',
  'events/scripts',
];
const EXCLUDES = ['node_modules/**', '**/.DS_Store', '**/package-lock.json', '**/pnpm-lock.yaml'];

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

// ディレクトリは copy＋除外指定。単一ファイルは copyto（フィルタ併用不可）。
const rcloneArgs = (src, dst, preview) => {
  const isFile = fs.statSync(src).isFile();
  const args = [isFile ? 'copyto' : 'copy', src, dst];
  if (!isFile) for (const pattern of EXCLUDES) args.push('--exclude', pattern);
  if (preview) args.push('--dry-run');
  return args;
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

// スターターの「キーごとの最終タッチ ts」を返す関数を作る。
// ログで触れたキーはその ts、checkpoint 由来のキーは compactedAt を下限、未存在キーは ''（常にプロジェクト勝ち）
const makeLatestTs = (lib, base, starterEvents, trees) => {
  const latest = new Map();
  for (const event of starterEvents) latest.set(event.key, event.ts);
  const floor = base.compactedAt ?? '';
  return (key) => latest.get(key) ?? (valueAt(trees, key) !== undefined ? floor : '');
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

// 候補イベントの勝敗を判定する。勝ちは「プロジェクトの ts がスターターより新しい」かつ「状態を変える」。
// working は注入済みを反映した作業ツリーで、no-op 判定を逐次正しく行う
const decideInjection = (lib, starter, candidates) => {
  const { base, starterEvents, trees } = starter;
  const latestTs = makeLatestTs(lib, base, starterEvents, trees);
  const working = structuredClone(trees);
  const pending = [];
  const rows = [];
  for (const event of candidates) {
    const key = event.key;
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
      lib.setPath(working.meta, key.slice('meta.'.length), event.value);
    } else {
      if (valueAt(working, key) === undefined) {
        rows.push([`SKIP   ${key}  del`, 'no-op（キーなし）']);
        continue;
      }
      lib.deletePath(working.meta, key.slice('meta.'.length));
    }
    pending.push(event);
    rows.push([
      `INJECT ${key}  ${event.type}`,
      `project ${event.ts} > starter ${starterTs || '記録なし'}`,
    ]);
  }
  return { pending, rows };
};

// プロジェクトの meta.* イベントをスターターのログへ注入する。
// 勝敗はキー単位の ts 比較（プロジェクトがスターターより新しいものだけ注入）。
// スターターの状態を変えないイベント（no-op）は注入しない。注入後はスターター側で build を実行する
const injectMetaEvents = async (starterRoot, run) => {
  const projectLogPath = path.join(PROJECT_ROOT, 'events/log.jsonl');
  const starterEventsDir = path.join(starterRoot, 'events');
  if (!fs.existsSync(projectLogPath)) {
    console.log('[injection] skip: プロジェクトに events/log.jsonl がない');
    return;
  }
  if (!fs.existsSync(starterEventsDir)) {
    console.log('[injection] skip: スターターに events/ がない');
    return;
  }

  // スターター側の状態を畳むため EVENTS_DIR を差し替えてから共有ライブラリを読み込む。
  // ログが無い・空のスターター（コンパクション直後など）は空ログとして扱う
  const prevEventsDir = process.env.EVENTS_DIR;
  process.env.EVENTS_DIR = starterEventsDir;
  try {
    // クエリでモジュールキャッシュを無効化し、毎回 EVENTS_DIR を再評価した lib を読み込む
    const libUrl = new URL('../../events/scripts/lib.mjs', import.meta.url).href;
    const lib = await import(`${libUrl}?t=${++libSeq}`);
    const base = lib.loadBase();
    const logPath = path.join(starterEventsDir, 'log.jsonl');
    const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
    const { trees, events: starterEvents } = hasLog
      ? lib.foldAll()
      : { trees: structuredClone(base.trees), events: [] };
    const candidates = readCandidates(lib, projectLogPath);
    const { pending, rows } = decideInjection(lib, { base, starterEvents, trees }, candidates);

    console.log(`[injection] meta.* イベント ${candidates.length} 件の勝敗判定`);
    for (const [verdict, detail] of rows) console.log(`  ${verdict.padEnd(54)} ${detail}`);
    console.log(
      `[injection] ${pending.length} 件を注入 / ${candidates.length - pending.length} 件スキップ`,
    );

    if (!run) {
      console.log('[injection] dry-run。--run で注入');
      return;
    }
    if (pending.length === 0) {
      console.log('[injection] 注入なし');
      return;
    }
    fs.appendFileSync(logPath, pending.map((event) => JSON.stringify(event)).join('\n') + '\n');
    console.log(`[injection] ${pending.length} 件を ${logPath} へ追記`);
    const build = spawnSync('node', ['events/scripts/build.mjs'], {
      cwd: starterRoot,
      env: { ...process.env, EVENTS_DIR: starterEventsDir },
      stdio: 'inherit',
    });
    if (build.status !== 0) fail('スターター側の build が失敗しました');
  } finally {
    // fail() は process.exit で終了するため、異常系ではここに到達しない（復元不要）
    if (prevEventsDir === undefined) delete process.env.EVENTS_DIR;
    else process.env.EVENTS_DIR = prevEventsDir;
  }
};

const main = async () => {
  const { run, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('同期対象:');
    for (const target of TARGETS) console.log(`  ${target}`);
    console.log(`除外: ${EXCLUDES.join(' / ')}`);
    console.log(
      '加えて meta.* のログイベントをキー単位の ts 比較でスターターのログへ注入し、build を実行する',
    );
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つからない: ${starterRoot}`);
  checkRclone();

  let failed = false;
  for (const target of TARGETS) {
    const src = path.join(PROJECT_ROOT, target);
    if (!fs.existsSync(src)) {
      console.log(`skip (not found): ${target}`);
      continue;
    }
    const dst = path.join(starterRoot, target);
    const result = spawnSync('rclone', rcloneArgs(src, dst, !run), { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
  if (failed) fail('rclone が一部の対象で失敗しました');

  await injectMetaEvents(starterRoot, run);

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }
  console.log(
    '同期完了。スターター側の meta.json は build で更新済み。残りの記録（status 主張 → commit）はスターター側の通常フローで行うこと',
  );
};

void main();
