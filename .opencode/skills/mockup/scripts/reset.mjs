// モックアップワークベンチをまっさらな初期状態に戻すスクリプト。
// 機構（vite.config / overlay / theme.css / 本スクリプト）と lockfile は保持し、
// プロジェクトデータ（画面ソース・dist・指示ログ）と node_modules だけを消す。
// events へは一切触れない。使い方:
//   node scripts/reset.mjs          # dry-run: 削除対象の一覧を表示するだけ
//   node scripts/reset.mjs --force  # 実行: 削除 + pnpm install で再構築
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workbench = join(skillRoot, 'workbench');

// 削除対象を収集する。lockfile はバージョン固定の再現性のため常に保持する
const collectTargets = () => {
  const targets = [];
  for (const file of readdirSync(workbench)) {
    if (file.endsWith('.html')) targets.push(join(workbench, file));
  }
  const candidates = [
    join(workbench, 'dist'),
    join(workbench, 'annotations.jsonl'),
    join(workbench, 'node_modules'),
  ];
  for (const candidate of candidates) if (existsSync(candidate)) targets.push(candidate);
  return targets;
};

const force = process.argv.includes('--force');
const targets = collectTargets();

if (targets.length === 0) {
  console.log('[mockup] workbench is already pristine. nothing to do.');
  process.exit(0);
}

console.log('[mockup] reset plan:');
for (const target of targets) console.log(`  - ${target}`);

if (!force) {
  console.log('\n[mockup] dry-run. re-run with --force to execute.');
  process.exit(0);
}

// 起動中のサーバーがいれば先に止める（node_modules 削除中の書き込み競合を避ける）。
// dry-run は副作用ゼロが原則のため、停止は --force 実行時のみ行う
if (existsSync(join(workbench, '.dev.pid'))) {
  const pid = Number(readFileSync(join(workbench, '.dev.pid'), 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
    console.log(`[mockup] stopped running dev server (pid ${pid})`);
  } catch {
    // 既に死んでいる場合は何もしない
  }
  rmSync(join(workbench, '.dev.pid'));
}

for (const target of targets) rmSync(target, { recursive: true, force: true });
console.log('[mockup] removed. reinstalling packages...');
const install = spawnSync('pnpm', ['install'], { cwd: workbench, stdio: 'inherit' });
if (install.status !== 0) {
  console.error('[mockup] pnpm install failed. run it manually inside workbench/.');
  process.exit(install.status ?? 1);
}
console.log(
  '[mockup] pristine. note: events registrations are untouched —\n' +
    '  consider `del product.look.mockups.<id>` in the source project if abandoning them.',
);
