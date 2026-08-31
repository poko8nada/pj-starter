// 状態（ログ / チェックポイント）の読み書き。パスは paths の遅延関数で解決する
import fs from 'node:fs';
import { CHECKPOINT_PATH, LOG_PATH } from './paths.mjs';
import { fail, jstNow } from './util.mjs';

export const readEvents = () => {
  if (!fs.existsSync(LOG_PATH())) return [];
  return fs
    .readFileSync(LOG_PATH(), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const event = JSON.parse(line);
      if (typeof event.ts !== 'string' || event.type === undefined || event.key === undefined) {
        fail(`invalid event at line ${index + 1}`);
      }
      return event;
    });
};

export const parseCheckpoint = (text) => {
  let checkpoint;
  try {
    checkpoint = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !checkpoint ||
    typeof checkpoint !== 'object' ||
    Array.isArray(checkpoint) ||
    !checkpoint.trees ||
    typeof checkpoint.trees !== 'object' ||
    Array.isArray(checkpoint.trees)
  ) {
    return null;
  }
  return { trees: checkpoint.trees, compactedAt: checkpoint.compactedAt ?? null };
};

export const stripHistory = (value) => {
  if (Array.isArray(value)) return value.map(stripHistory);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'status' && key !== 'updatedAt')
        .map(([key, child]) => [key, stripHistory(child)]),
    );
  }
  return value;
};

export const writeCheckpoint = (trees, compactedAt = jstNow()) => {
  fs.writeFileSync(
    CHECKPOINT_PATH(),
    `${JSON.stringify({ compactedAt, asOf: null, trees }, null, 2)}\n`,
  );
};

// チェックポイントを読み込み、畳み込みの起点とする。
// 空ファイルや不正な JSON も「チェックポイントなし」と同じ起点にする
export const loadBase = () => {
  if (!fs.existsSync(CHECKPOINT_PATH())) {
    return { trees: { product: {}, meta: {} }, compactedAt: null };
  }
  return (
    parseCheckpoint(fs.readFileSync(CHECKPOINT_PATH(), 'utf8')) ?? {
      trees: { product: {}, meta: {} },
      compactedAt: null,
    }
  );
};
