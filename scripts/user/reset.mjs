#!/usr/bin/env node
// スターター複製の初期化ツール。checkpoint へ定義のみの初期状態を書き、log を name/what で再開させる。
// 引数なしは dry-run。--run で実行。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildEvent,
  CHECKPOINT_PATH,
  EVENTS_DIR,
  EventError,
  fail,
  foldAll,
  jstNow,
  LOG_PATH,
  stripHistory,
  writeCheckpoint,
} from '../../events/scripts/lib.mjs';

const ROOT_DIR = path.resolve(EVENTS_DIR(), '..');
// 同リポジトリの build を子プロセスで実行。EVENTS_DIR は引き継がれる。
const BUILD_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts/build.mjs',
);
const DEFAULT_NAME = 'プロジェクト名が入ります';
const WHAT_TEXT = '今からプロジェクトを作り始める段階です';

// 種まき素材の収集。meta 全体と product.stack のみ引き継ぐ。
const collectBaseline = () => {
  const { trees } = foldAll();
  return { meta: stripHistory(trees.meta ?? {}), stack: stripHistory(trees.product?.stack ?? {}) };
};

// meta の unit 数。dry-run の計画表示で使う。
const countUnits = (meta) =>
  Object.values(meta).reduce(
    (sum, section) =>
      sum +
      Object.values(section ?? {}).filter(
        (node) => node && typeof node === 'object' && !Array.isArray(node) && 'purpose' in node,
      ).length,
    0,
  );

// --run の有無だけが分岐点。直後の値だけをプロジェクト名として扱う。
const parseArgs = (argv) => {
  const runIndex = argv.indexOf('--run');
  if (runIndex === -1) {
    if (argv.length > 0) fail(`unexpected argument: ${argv[0]} (usage: reset.mjs [--run [name]])`);
    return { run: false, name: undefined };
  }
  const after = argv.slice(runIndex + 1);
  if (
    argv.slice(0, runIndex).length > 0 ||
    after.length > 1 ||
    after.some((a) => a.startsWith('--'))
  ) {
    fail('unexpected arguments (usage: reset.mjs [--run [name]])');
  }
  return { run: true, name: after[0] === '' ? undefined : after[0] };
};

const main = () => {
  const { run, name } = parseArgs(process.argv.slice(2));
  const projectName = name ?? DEFAULT_NAME;
  const { meta, stack } = collectBaseline();

  const readmeFiles = ['README.md', 'README.ja.md'].map((file) => path.join(ROOT_DIR, file));
  const logLines = fs.existsSync(LOG_PATH())
    ? fs
        .readFileSync(LOG_PATH(), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '').length
    : 0;

  console.log(`削除: ${path.relative(ROOT_DIR, CHECKPOINT_PATH())} / README.md / README.ja.md`);
  console.log(`log: ${logLines} 行を初期化し、name/what の 2 イベントをアペンド`);
  console.log(
    `checkpoint 種まき: meta ${countUnits(meta)} unit / stack ${
      Object.keys(stack).length
    } キー — status/updatedAt を再帰除去`,
  );
  console.log(`名前: ${projectName}`);
  console.log('最後に build でスナップショットを再生成');

  if (!run) {
    console.log('[dry-run] --run で実行');
    return;
  }

  // wipe は baseline 収集の後。スターター本体での実行は git 履歴で復元できる
  for (const file of [CHECKPOINT_PATH(), ...readmeFiles]) if (fs.existsSync(file)) fs.rmSync(file);
  fs.writeFileSync(LOG_PATH(), '');
  writeCheckpoint({ product: { stack }, meta });
  const ts = jstNow();
  const events = [
    buildEvent({ type: 'set', key: 'product.name.value', value: projectName }, ts),
    buildEvent({ type: 'set', key: 'product.what.value', value: WHAT_TEXT }, ts),
  ];
  fs.appendFileSync(LOG_PATH(), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  const build = spawnSync(process.execPath, [BUILD_SCRIPT], { stdio: 'inherit' });
  if (build.error || build.status !== 0) fail('build に失敗しました');
  console.log('reset 完了');
};

try {
  main();
} catch (error) {
  if (error instanceof EventError) fail(error.message);
  throw error;
}
