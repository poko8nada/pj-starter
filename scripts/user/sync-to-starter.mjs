#!/usr/bin/env node
// ハーネスをプロジェクトからスターターへ丸ごと同期する。選別ロジックなし、復元はユーザー手動。
// events の状態ファイルは対象外。引数なしは使い方表示、<path> はプレビュー、--run <path> で実行。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = 'usage: node scripts/user/sync-to-starter.mjs [--run] <スターターのパス>';

// 同期対象。events の状態ファイルは含めない。
// lock は生成物なので運ばない。package.json を同期したら受取側の次回起動で依存が解決される
const TARGETS = [
  '.opencode',
  'scripts',
  'AGENTS.md',
  'lefthook.yaml',
  'events/README.md',
  'events/spec',
  'events/scripts',
];
const EXCLUDES = ['node_modules/**', '**/.DS_Store', '**/package-lock.json', '**/pnpm-lock.yaml'];

const fail = (message) => {
  console.error(`error: ${message}`);
  console.error(USAGE);
  process.exit(1);
};

const parseArgs = (argv) => {
  const run = argv.includes('--run');
  const rest = argv.filter((arg) => arg !== '--run');
  if (rest.length > 1) fail('too many arguments');
  return { run, starterDir: rest[0] };
};

const checkRclone = () => {
  const probe = spawnSync('rclone', ['version'], { encoding: 'utf8' });
  if (probe.error) fail('rclone が見つかりません。インストールしてから実行してください');
};

// ディレクトリは copy＋除外指定。単一ファイルは copyto（フィルタ併用不可）。
const rcloneArgs = (src, dst, preview) => {
  const isFile = fs.statSync(src).isFile();
  const args = [isFile ? 'copyto' : 'copy', src, dst];
  if (!isFile) for (const pattern of EXCLUDES) args.push('--exclude', pattern);
  if (preview) args.push('--dry-run');
  return args;
};

const main = () => {
  const { run, starterDir } = parseArgs(process.argv.slice(2));
  if (!starterDir) {
    console.log('同期対象:');
    for (const target of TARGETS) console.log(`  ${target}`);
    console.log(`除外: ${EXCLUDES.join(' / ')}`);
    console.log(`${USAGE}\n<パス> を渡すと dry-run プレビュー、--run 付きで実コピー`);
    return;
  }

  const starterRoot = path.resolve(starterDir);
  if (!fs.existsSync(starterRoot)) fail(`スターターが見つからない: ${starterRoot}`);
  checkRclone();

  let failed = false;
  for (const target of TARGETS) {
    const src = path.join(PROJECT_ROOT, target);
    if (!fs.existsSync(src)) {
      console.log(`skip (not found): ${target}`);
      continue;
    }
    const dst = path.join(starterRoot, target);
    const result = spawnSync('rclone', rcloneArgs(src, dst, !run), { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
  if (failed) fail('rclone が一部の対象で失敗しました');

  if (!run) {
    console.log('[dry-run] --run で実コピー');
    return;
  }
  console.log('同期完了。スターター側で通常フロー（status 主張 → build → commit）で記録すること');
};

main();
