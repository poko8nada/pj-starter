#!/usr/bin/env node
// チェックポイント＋アクティブログからスナップショットを再生成する。
// 内容が無変化のときは書き換えないため、generatedAt と mtime は安定する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  deriveSnapshots,
  EVENTS_DIR,
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
// 書いた場合はファイルパスを返し、書かなかった場合は null を返す
const writeSnapshot = (name, content) => {
  const file = path.join(SNAPSHOTS_DIR(), `${name}.json`);
  if (fs.existsSync(file)) {
    try {
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (JSON.stringify(current.content) === JSON.stringify(content)) return null;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: jstNow(), asOf, content }, null, 2)}\n`);
  return file;
};

// 書いた生成物をoxfmt正規形へ寄せる（生成器と整形器の往復差分を断つ）。
// 対象プロジェクト直下にバイナリが無い環境では素通しし、失敗してもビルドは壊さない。
const formatSnapshots = (files) => {
  // EVENTS_DIR起点で対象プロジェクトを解決する（cwd依存にしない。new.mjs/applyは別cwdで実行する）
  const root = path.dirname(EVENTS_DIR());
  const bin = path.join(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt',
  );
  if (!fs.existsSync(bin)) return;
  try {
    const result = spawnSync(bin, files, { cwd: root, stdio: 'ignore' });
    if ((result.status ?? 1) !== 0) {
      console.warn(`warning: oxfmt failed for snapshots (status ${result.status})`);
    }
  } catch {
    // 整形の失敗はビルドの失敗にしない（素のJSON出力のまま残す）
  }
};

const wroteProduct = writeSnapshot('product', snapshots.product);
let result = `product: ${wroteProduct ? 'updated' : 'up to date'}`;
let wroteMeta = null;
if (Object.keys(snapshots.meta).length > 0) {
  wroteMeta = writeSnapshot('meta', snapshots.meta);
  result += `, meta: ${wroteMeta ? 'updated' : 'up to date'}`;
}
let wroteWhy = null;
if (Object.keys(snapshots.why).length > 0) {
  wroteWhy = writeSnapshot('why', snapshots.why);
  result += `, why: ${wroteWhy ? 'updated' : 'up to date'}`;
}
const wroteFiles = [wroteProduct, wroteMeta, wroteWhy].filter((file) => file !== null);
if (wroteFiles.length > 0) formatSnapshots(wroteFiles);
console.log(result);
