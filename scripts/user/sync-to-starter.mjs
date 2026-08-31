#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { syncFiles, checkRclone, SYNC_UNITS, COMMON_EXCLUDES, fail } from './sync/files.mjs';
import { syncMeta } from './sync/meta.mjs';

const USAGE = 'usage: node scripts/user/sync-to-starter.mjs [--run] <スターターのパス>';

const parseArgs = (argv) => {
  const run = argv.includes('--run');
  const rest = argv.filter((arg) => arg !== '--run');
  if (rest.length > 1) fail('too many arguments');
  return { run, starterDir: rest[0] };
};

const main = async () => {
  const { run, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('同期対象:');
    for (const unit of SYNC_UNITS) console.log(`  ${unit.label}: ${unit.paths.join(', ')}`);
    console.log(`除外: ${COMMON_EXCLUDES.join(' / ')}`);
    console.log(
      '加えて meta.* はコミット済みのみ双方向へ流し、プロジェクト側を reset 同様にストリップする',
    );
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つかりない: ${starterRoot}`);
  checkRclone();

  const filesOk = syncFiles(starterRoot, run);
  if (!filesOk) fail('bisync が一部の対象で失敗しました（安全 abort は手動解決が必要）');

  await syncMeta(starterRoot, run);

  if (!run) {
    console.log('[dry-run] --run で実コピーと注入');
    return;
  }
  console.log(
    '同期完了。スターター側の meta.json は build で更新済み。残りの記録（status 主張 → commit）はスターター側の通常フローで行うこと',
  );
};

void main();
