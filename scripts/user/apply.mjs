#!/usr/bin/env node
// スターターをプロジェクトへ一方向適用するツール（純 Node 実装）。
// 引数なしは dry-run。--run で実行、--init でログ掃除（旧 reset 相当）も行う。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyFiles, SYNC_UNITS, COMMON_EXCLUDES, fail } from './apply/files.mjs';
import { applyMeta } from './apply/meta.mjs';

const USAGE = 'usage: node scripts/user/apply.mjs [--run] [--init] <スターターのパス>';

const parseArgs = (argv) => {
  const run = argv.includes('--run');
  const init = argv.includes('--init');
  const rest = argv.filter((arg) => arg !== '--run' && arg !== '--init');
  if (rest.length > 1) fail('too many arguments');
  return { run, init, starterDir: rest[0] };
};

const main = async () => {
  const { run, init, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('適用対象:');
    for (const unit of SYNC_UNITS) console.log(`  ${unit.label}: ${unit.paths.join(', ')}`);
    console.log(`除外: ${COMMON_EXCLUDES.join(' / ')}`);
    console.log('meta.* はスターターのコミット済み在庫で置換し、プロジェクト側をストリップする');
    console.log('--init を付けるとログを空にして name/what で再開する（旧 reset 相当）');
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つかりません: ${starterRoot}`);

  const changes = applyFiles(starterRoot, run);
  if (changes.length === 0) console.log('ファイル変更なし（同一状態）');
  for (const change of changes) console.log(change);

  await applyMeta(starterRoot, run, init);

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }
  console.log('適用完了。スターターのハーネスと meta 在庫がプロジェクトへ反映されました');
};

void main();
