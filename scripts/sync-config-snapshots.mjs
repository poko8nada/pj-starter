/*
 * FEATURES: M-sync
 * PURPOSE: package.json / tsconfig.json を _ 付きスナップショットへ上書きコピーしてステージする (isDone: true)
 * STATUS: sizeDrift=false, driftSuspected=false
 */
// 設定ファイルのスナップショット (_package.json / _tsconfig.json) を本体と同期するスクリプト
// 使い方: node scripts/sync-config-snapshots.mjs
// 仕組み: 本体 (package.json / tsconfig.json) を _ 付きファイルへ上書きコピーし、git add でステージする。
//         lefthook の stage_fixed は「元々ステージ済みのファイル」しか再ステージしないため、
//         新規に変更されたスナップショットはここで明示的にステージする必要がある。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 同期ペア一覧（key: 本体, value: スナップショット）
const SNAPSHOT_PAIRS = [
  ['package.json', '_package.json'],
  ['tsconfig.json', '_tsconfig.json'],
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 全ペアを上書きコピーして本体の内容をスナップショットへ反映する
const snapshots = [];
for (const [sourceName, snapshotName] of SNAPSHOT_PAIRS) {
  fs.copyFileSync(path.join(root, sourceName), path.join(root, snapshotName));
  snapshots.push(snapshotName);
}

// スナップショットをステージする（pre-commit で実行される前提）
const result = spawnSync('git', ['add', ...snapshots], { stdio: 'inherit', cwd: root });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
