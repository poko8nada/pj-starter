#!/usr/bin/env node
// append と build のラッパー。append が成功したときだけ build を実行し、
// 両方の結果をそのまま出力する。append が失敗したら build は実行せず失敗で終了する。
// 引数は append.mjs にそのまま渡す。スクリプトの位置は自身の場所から解決する（cwd 非依存）
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const run = (name, args) => {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, name), ...args], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
};

const appendStatus = run('append.mjs', process.argv.slice(2));
if (appendStatus !== 0) process.exit(appendStatus);
process.exit(run('build.mjs', []));
