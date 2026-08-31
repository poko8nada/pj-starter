#!/usr/bin/env node
// スナップショット（content のみ）を読み出して stdout へ出力する読み取り専用 CLI。
// 畳み込み（build）とは分離した、消費側向けの安定した入口を提供する
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fail, findUnresolved, parseArgs, SNAPSHOTS_DIR } from './lib.mjs';

const NAMED = new Set(['product', 'meta']);

const loadContent = (name) => {
  const file = path.join(SNAPSHOTS_DIR(), `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).content;
};

const formatUnresolved = (items) => {
  if (items.length === 0) return '未確定のコンポーネントはありません';
  const lines = items.map(
    (item) => `- ${item.name}  (${item.path || 'pathなし'})  [${item.stage}]  ${item.text}`,
  );
  return `未確定のコンポーネントがあります:\n${lines.join('\n')}`;
};

const main = () => {
  const raw = process.argv.slice(2);
  const unresolved = raw.includes('--unresolved');
  const args = parseArgs(raw.filter((arg) => arg !== '--unresolved'));
  const name = args.name;
  if (!name) fail('--name product|meta is required');
  if (!NAMED.has(name)) fail(`--name must be one of ${[...NAMED].join('/')}`);

  if (unresolved) {
    const content = loadContent(name);
    if (content === null) {
      console.log('未確定のコンポーネントはありません');
      return;
    }
    const items = findUnresolved({ [name]: content });
    console.log(formatUnresolved(items));
    return;
  }

  const content = loadContent(name);
  if (content === null) {
    console.log('null');
    return;
  }
  console.log(JSON.stringify(content));
};

main();
