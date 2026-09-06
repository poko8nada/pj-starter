// 新規立ち上げ時のイベント初期化。対象の checkpoint と README を削除し、
// ログを name/what の 2 イベントに戻し、product.stack + 起点のコミット済み meta 在庫を種まきする。
// log.jsonl がなくても動く。apply 内部は参照しない（小関数は new 側に持つ）。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as lib from '../../../events/scripts/lib.mjs';

// EVENTS_DIR を差し替えて実行する（起点と対象を使い分けるため）
const withEventsDir = (eventsDir, fn) => {
  const prev = process.env.EVENTS_DIR;
  process.env.EVENTS_DIR = eventsDir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EVENTS_DIR;
    else process.env.EVENTS_DIR = prev;
  }
};

// コミット済みコンポーネントのみを在庫として抽出する
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

const readState = () => {
  const base = lib.loadBase();
  const logPath = lib.LOG_PATH();
  const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
  const { trees } = hasLog ? lib.foldAll() : { trees: structuredClone(base.trees) };
  return trees;
};

const DEFAULT_NAME = 'プロジェクト名が入ります';
const WHAT_TEXT = '今からプロジェクトを作り始める段階です';

// 対象のイベントを初期化する。run が falsy ならプレビューのみ
export const initEvents = (starterRoot, targetRoot, run) => {
  const starterEventsDir = path.join(starterRoot, 'events');
  const targetEventsDir = path.join(targetRoot, 'events');
  const trees = withEventsDir(starterEventsDir, readState);
  const stripped = lib.stripHistory(committedInventory(trees));
  const stack = trees.product?.stack ?? {};
  const stackKeys = Object.keys(stack).length;
  const unitCount = Object.values(stripped).reduce(
    (sum, section) => sum + Object.keys(section).length,
    0,
  );

  const readmeFiles = ['README.md', 'README.ja.md'].map((file) => path.join(targetRoot, file));
  const logLines = withEventsDir(targetEventsDir, () => {
    const logPath = lib.LOG_PATH();
    if (!fs.existsSync(logPath)) return 0;
    return fs
      .readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '').length;
  });

  console.log(
    `削除: ${path.relative(targetRoot, path.join(targetEventsDir, 'checkpoint.json'))} / README.md / README.ja.md`,
  );
  console.log(`log: ${logLines} 行を初期化し、name/what の 2 イベントをアペンド`);
  console.log(`checkpoint 種まき: stack ${stackKeys} キー / meta ${unitCount} unit`);
  console.log(`名前: ${DEFAULT_NAME}`);

  if (!run) return;

  fs.mkdirSync(targetEventsDir, { recursive: true });
  withEventsDir(targetEventsDir, () => {
    for (const file of [lib.CHECKPOINT_PATH(), ...readmeFiles]) {
      if (fs.existsSync(file)) fs.rmSync(file);
    }
    fs.writeFileSync(lib.LOG_PATH(), '');
    lib.writeCheckpoint({ product: { stack: lib.stripHistory(stack) }, meta: stripped });
    const ts = lib.jstNow();
    const events = [
      lib.buildEvent({ type: 'set', key: 'product.name.value', value: DEFAULT_NAME }, ts),
      lib.buildEvent({ type: 'set', key: 'product.what.value', value: WHAT_TEXT }, ts),
    ];
    fs.appendFileSync(
      lib.LOG_PATH(),
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    );
  });
};
