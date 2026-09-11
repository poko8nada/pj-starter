#!/usr/bin/env node
// 新規立ち上げの単一入口（純 Node 実装）。
// スターターのルートで `node scripts/user/new.mjs <名前>` と実行する。作り先は親ディレクトリ配下。
// 配布物には含めない（scripts 群の除外設定で運ばない）。エージェントは実行しないこと。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { groupsFor } from './groups.mjs';
import { copyScaffold } from './new/scaffold.mjs';
import { initEvents } from './new/init.mjs';

// 起点（スターター）はこのファイルの位置から解決する（fileURLToPath でデコードする）
export const STARTER_ROOT = () =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

// 対象の解決。--in がなければ起点の親（隣に作る）
export const resolveTarget = (starterRoot, name, parentOpt) =>
  path.resolve(parentOpt ?? path.dirname(starterRoot), name);

export const STEPS = [
  { id: 'scaffold', label: 'scaffold 複写（new 群）' },
  { id: 'git', label: 'git 初期化' },
  { id: 'install', label: 'pnpm 導入（prepare 経由で lefthook／merge-driver まで）' },
  { id: 'events', label: 'イベント初期化（ログ掃除・checkpoint 種まき）' },
  { id: 'readme', label: '空 README 生成' },
  { id: 'build', label: 'スナップショット再生成' },
];

const USAGE =
  'usage: node scripts/user/new.mjs [--in <親>] [--force] [--skip-scaffold] [--skip-readme] [--skip-git] [--skip-install] [--skip-events] [--skip-build] [--run] <名前>';

const SKIP_OF = {
  scaffold: '--skip-scaffold',
  readme: '--skip-readme',
  git: '--skip-git',
  install: '--skip-install',
  events: '--skip-events',
  build: '--skip-build',
};

const parseArgs = (argv) => {
  const opts = {
    run: false,
    help: false,
    force: false,
    parent: null,
    skips: new Set(),
    names: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run') opts.run = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--in') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail(`--in には親ディレクトリが必要\n${USAGE}`);
      }
      opts.parent = argv[++i];
    } else if (Object.values(SKIP_OF).includes(arg)) opts.skips.add(arg);
    else if (arg.startsWith('--')) fail(`unknown flag: ${arg}\n${USAGE}`);
    else opts.names.push(arg);
  }
  return opts;
};

const validateName = (name) => {
  if (name === undefined || name === '') fail(`名前が必要です\n${USAGE}`);
  if (name.split('/').length > 1 || name.split('\\').length > 1 || name === '.' || name === '..') {
    fail(`名前は単一のディレクトリ名にしてください: ${name}`);
  }
};

// 実行可否の事前判定（非破壊）。problems が空なら実行可能。
// 同一判定は実パス比較で行う（/var → /private/var のような symlink を見抜くため）
export const checkTarget = (starterRoot, target, force) => {
  const problems = [];
  const same = fs.existsSync(target) && fs.realpathSync(target) === fs.realpathSync(starterRoot);
  if (same) problems.push('対象が起点と同じです');
  else if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) problems.push('対象がディレクトリではありません');
    else if (fs.readdirSync(target).length > 0 && !force) {
      problems.push('対象が空ではありません（--force で上書き）');
    }
  }
  return problems;
};

// 工程の実行本体。外付バイナリは環境変数で差し替え可能（テストで失敗系を再現するため）
const runCmd = (label, bin, args, cwd) => {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) fail(`${label} が失敗しました`);
};

// 起点の build.mjs を対象の events に向けて実行する（対象側の複写有無に依存しない）
const runBuild = (starter, target) => {
  const result = spawnSync('node', [path.join(starter, 'events', 'scripts', 'build.mjs')], {
    cwd: target,
    env: { ...process.env, EVENTS_DIR: path.join(target, 'events') },
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('スナップショット再生成 が失敗しました');
};

const hasCommits = (target, gitBin) =>
  spawnSync(gitBin, ['-C', target, 'rev-parse', 'HEAD'], { stdio: 'pipe' }).status === 0;

const runners = {
  scaffold: (ctx) => {
    copyScaffold(ctx.starter, ctx.target);
  },
  git: (ctx) => {
    const bin = process.env.GIT_BIN ?? 'git';
    if (hasCommits(ctx.target, bin)) fail('対象にコミット履歴があります。手動で対処してください');
    runCmd('git 初期化', bin, ['init'], ctx.target);
  },
  install: (ctx) => {
    runCmd('pnpm 導入', process.env.PNPM_BIN ?? 'pnpm', ['install'], ctx.target);
  },
  events: (ctx) => {
    initEvents(ctx.starter, ctx.target, true);
  },
  readme: (ctx) => {
    for (const file of ['README.md', 'README.ja.md']) {
      const dest = path.join(ctx.target, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, '');
    }
  },
  build: (ctx) => {
    runBuild(ctx.starter, ctx.target);
  },
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.names.length === 0) {
    console.log('スターターの隣に新規プロジェクトを1発で作る');
    console.log(
      `new 対象群: ${groupsFor('new')
        .map((group) => group.id)
        .join(', ')}`,
    );
    console.log(
      `${USAGE}\n引数なしは用法表示、名前あり・--run なしは dry-run プレビュー。初回コミットは手動で行う`,
    );
    return;
  }
  if (opts.names.length > 1) fail('too many arguments');
  validateName(opts.names[0]);

  const starter = STARTER_ROOT();
  const target = resolveTarget(starter, opts.names[0], opts.parent);
  console.log(`起点: ${starter}`);
  console.log(`対象: ${target}`);
  for (const step of STEPS) {
    console.log(`${opts.skips.has(SKIP_OF[step.id]) ? 'skip' : '実行'}: ${step.label}`);
  }
  const problems = checkTarget(starter, target, opts.force);
  for (const problem of problems) console.log(`中止: ${problem}`);
  if (problems.length > 0) process.exit(1);
  if (!opts.run) {
    console.log('[dry-run] --run で実行');
    return;
  }
  const ctx = { starter, target };
  for (const step of STEPS) {
    if (opts.skips.has(SKIP_OF[step.id])) continue;
    const run = runners[step.id];
    if (!run) fail(`未実装の工程: ${step.label}`);
    run(ctx);
    console.log(`完了: ${step.label}`);
  }
  console.log('new 完了。初回コミットは手動で行ってください');
};

void main();
