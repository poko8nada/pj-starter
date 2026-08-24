#!/usr/bin/env node
// スナップショット（content のみ）を読み出して stdout へ出力する読み取り専用 CLI。
// 畳み込み（build）とは分離した、消費側向けの安定した入口を提供する
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fail, parseArgs, SNAPSHOTS_DIR } from './lib.mjs';

const NAMED = new Set(['product', 'meta', 'agenda']);

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name;
  if (!name) fail('--name product|meta|agenda is required');
  if (!NAMED.has(name)) fail(`--name must be one of ${[...NAMED].join('/')}`);
  const file = path.join(SNAPSHOTS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.log('null');
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(snapshot.content));
};

main();
