#!/usr/bin/env node
// チェックポイント＋アクティブログからスナップショットを再生成する。
// 内容が無変化のときは書き換えないため、generatedAt と mtime は安定する
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveSnapshots,
  foldAll,
  injectUpdatedAt,
  jstNow,
  normalizeTrees,
  SNAPSHOTS_DIR,
} from './lib.mjs';

const { trees: folded, asOf, events } = foldAll();
normalizeTrees(folded);
injectUpdatedAt(folded, events);
// 書き出し整形：product/meta 定義と why 投影をそれぞれ適用する（配列とlog行順は対象外）
const snapshots = deriveSnapshots(folded);
fs.mkdirSync(SNAPSHOTS_DIR(), { recursive: true });

// 生成物を書き出す。整形済み内容と同一なら何もしない（順序差も移行のため書き直す）
const writeSnapshot = (name, content) => {
  const file = path.join(SNAPSHOTS_DIR(), `${name}.json`);
  if (fs.existsSync(file)) {
    try {
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (JSON.stringify(current.content) === JSON.stringify(content)) return false;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: jstNow(), asOf, content }, null, 2)}\n`);
  return true;
};

const wroteProduct = writeSnapshot('product', snapshots.product);
let result = `product: ${wroteProduct ? 'updated' : 'up to date'}`;
if (Object.keys(snapshots.meta).length > 0) {
  const wroteMeta = writeSnapshot('meta', snapshots.meta);
  result += `, meta: ${wroteMeta ? 'updated' : 'up to date'}`;
}
if (Object.keys(snapshots.why).length > 0) {
  const wroteWhy = writeSnapshot('why', snapshots.why);
  result += `, why: ${wroteWhy ? 'updated' : 'up to date'}`;
}
console.log(result);
