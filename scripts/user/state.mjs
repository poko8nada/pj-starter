// apply / new で共有するイベント状態の読み出し。lib.mjs は遅延解決（呼び出し時に
// EVENTS_DIR を読む）のため、同一モジュールのままで env を差し替えるだけで双方の
// ディレクトリを扱える。キャッシュ破棄の動的 import は不要
import fs from 'node:fs';
import process from 'node:process';
import * as lib from '../../events/scripts/lib.mjs';

// EVENTS_DIR を差し替えて実行する（起点と対象を使い分けるため）
export const withEventsDir = (eventsDir, fn) => {
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
export const committedInventory = (trees) => {
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

// ベース＋ログから現在のツリーを読む。ログが空ならベース複写を返す
export const readState = () => {
  const base = lib.loadBase();
  const logPath = lib.LOG_PATH();
  const hasLog = fs.existsSync(logPath) && fs.statSync(logPath).size > 0;
  if (!hasLog) return { base, trees: structuredClone(base.trees) };
  const { trees } = lib.foldAll();
  return { base, trees };
};
