#!/usr/bin/env node
// 現在状態をチェックポイントへ退避し、アクティブなログを生存行だけに細らせる。
// 圧縮前の履歴は git が保持するためアーカイブ機構は持たない。
// 生存行（キー完全一致ごとの最終出現、削除含む）を元の相対順序で残すため、
// 畳み直しても状態は不変で、既存スナップショットは圧縮後も正しいまま。
// fold不参加の trail（log.*）は落とす。
// updatedAt も導出値として checkpoint に含める（コンパクション後に消えないように）
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CHECKPOINT_PATH, foldAll, injectUpdatedAt, jstNow, LOG_PATH, NAMESPACES } from './lib.mjs';

// 生存行の選別。fold参加名前空間のみ対象とし、キー完全一致ごとの最終出現を
// 元の相対順序で残す。last-write-wins のため畳み結果は不変
export const selectSurvivors = (events) => {
  const lastIndex = new Map();
  events.forEach((event, index) => {
    if (!NAMESPACES[event.key.split('.')[0]]?.fold) return;
    lastIndex.set(event.key, index);
  });
  const keep = new Set(lastIndex.values());
  return events.filter((_, index) => keep.has(index));
};

const main = () => {
  const { trees, asOf, events } = foldAll();
  injectUpdatedAt(trees, events);
  fs.writeFileSync(
    CHECKPOINT_PATH(),
    `${JSON.stringify({ compactedAt: jstNow(), asOf, trees }, null, 2)}\n`,
  );
  const survivors = selectSurvivors(events);
  fs.writeFileSync(
    LOG_PATH(),
    survivors.length === 0 ? '' : `${survivors.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  console.log(`compacted (asOf: ${asOf ?? 'none'})`);
};

// import 時は実行せず、直接実行時のみ main を呼ぶ
const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
