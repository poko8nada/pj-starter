#!/usr/bin/env node
// スターターをプロジェクトへ一方向適用するツール（純 Node 実装）。
// 引数なしは用法表示。--run で実行する。新規立ち上げは node scripts/user/new.mjs を使う。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyFiles, SYNC_UNITS, COMMON_EXCLUDES, fail } from './apply/files.mjs';
import { applyMeta } from './apply/meta.mjs';

const USAGE = 'usage: node scripts/user/apply.mjs [--run] <スターターのパス>';

const parseArgs = (argv) => {
  if (argv.includes('--init')) {
    fail('--init は node scripts/user/new.mjs に移管されました');
  }
  const run = argv.includes('--run');
  const rest = argv.filter((arg) => arg !== '--run');
  if (rest.length > 1) fail('too many arguments');
  return { run, starterDir: rest[0] };
};

const main = async () => {
  const { run, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('適用対象:');
    for (const unit of SYNC_UNITS) console.log(`  ${unit.label}: ${unit.paths.join(', ')}`);
    console.log(`除外: ${COMMON_EXCLUDES.join(' / ')}`);
    console.log('meta.* はスターターのコミット済み在庫で置換し、プロジェクト側をストリップする');
    console.log('新規立ち上げは node scripts/user/new.mjs を使う（旧 --init 相当）');
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つかりません: ${starterRoot}`);

  const changes = applyFiles(starterRoot, run);
  if (changes.length === 0) console.log('ファイル変更なし（同一状態）');
  for (const change of changes) console.log(change);

  await applyMeta(starterRoot, run);

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }
  console.log('適用完了。スターターのハーネスと meta 在庫がプロジェクトへ反映されました');
};

void main();
