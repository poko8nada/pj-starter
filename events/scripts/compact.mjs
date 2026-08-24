#!/usr/bin/env node
// 現在状態をチェックポイントへ退避し、アクティブなログを空にする。
// 圧縮前の履歴は git が保持するためアーカイブ機構は持たない。
// 状態そのものは不変なので、既存スナップショットは圧縮後も正しいまま
import fs from 'node:fs';
import { CHECKPOINT_PATH, foldAll, jstNow, LOG_PATH } from './lib.mjs';

const { trees, asOf } = foldAll();
fs.writeFileSync(
  CHECKPOINT_PATH,
  `${JSON.stringify({ compactedAt: jstNow(), asOf, trees }, null, 2)}\n`,
);
fs.writeFileSync(LOG_PATH, '');
console.log(`compacted (asOf: ${asOf ?? 'none'})`);
