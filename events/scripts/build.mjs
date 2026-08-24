#!/usr/bin/env node
// チェックポイント＋アクティブログからスナップショットを再生成する。
// 内容が無変化のときは書き換えないため、generatedAt と mtime は安定する
import fs from 'node:fs';
import path from 'node:path';
import {
  foldAll,
  injectUpdatedAt,
  jstNow,
  normalizeFeatures,
  normalizeMeta,
  SNAPSHOTS_DIR,
  stableStringify,
} from './lib.mjs';

const { trees, asOf, events } = foldAll();
normalizeFeatures(trees.product.features);
normalizeMeta(trees.meta);
injectUpdatedAt(trees, events);
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

// 生成物を書き出す。既存内容と同一なら何もしない
const writeSnapshot = (name, content) => {
  const file = path.join(SNAPSHOTS_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (stableStringify(current.content) === stableStringify(content)) return false;
  }
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: jstNow(), asOf, content }, null, 2)}\n`);
  return true;
};

const wroteProduct = writeSnapshot('product', trees.product);
let result = `product: ${wroteProduct ? 'updated' : 'up to date'}`;
if (Object.keys(trees.meta).length > 0) {
  const wroteMeta = writeSnapshot('meta', trees.meta);
  result += `, meta: ${wroteMeta ? 'updated' : 'up to date'}`;
}
console.log(result);
