#!/usr/bin/env node
// 現在状態をチェックポイントへ退避し、アクティブなログを空にする。
// 圧縮前の履歴は git が保持するためアーカイブ機構は持たない。
// ログは「前回コンパクトからのデルタ」を担うため、コンパクト後は空になる。
// 状態そのものは不変なので、既存スナップショットは圧縮後も正しいまま。
// updatedAt も導出値として checkpoint に含める（コンパクション後に消えないように）
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CHECKPOINT_PATH, foldAll, injectUpdatedAt, jstNow, LOG_PATH } from './lib.mjs';

const main = () => {
  const { trees, asOf, events } = foldAll();
  injectUpdatedAt(trees, events);
  fs.writeFileSync(
    CHECKPOINT_PATH(),
    `${JSON.stringify({ compactedAt: jstNow(), asOf, trees }, null, 2)}\n`,
  );
  fs.writeFileSync(LOG_PATH(), '');
  console.log(`compacted (asOf: ${asOf ?? 'none'})`);
};

// import 時は実行せず、直接実行時のみ main を呼ぶ
const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
