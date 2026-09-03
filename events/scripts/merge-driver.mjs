#!/usr/bin/env node
// log.jsonl 用の custom merge driver。相手側ブロック順＋自側新規行の末尾追加で結合し、自側ファイルへ書き出す。行は不透明なテキストとして扱い JSON 解釈しない。
// 登録: pnpm setup:merge-driver（各cloneで一度実行する）
// 併せて .gitattributes が log.jsonl に本driver、生成物に keep 用driverを割当てる。
// 生成物は手解消せず build で再生成する。詳細は events/spec/machinery.md の Merge 節
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 2-way 行集合結合。theirs の順序を保ち、ours 側の新規行（完全一致で未収録）を末尾へ足す。同一内容行は重複除去する。append-only 前提のため祖先は不要
export const mergeLines = (oursLines, theirsLines) => {
  const seen = new Set(theirsLines);
  const merged = [...theirsLines];
  for (const line of oursLines) {
    if (!seen.has(line)) {
      seen.add(line);
      merged.push(line);
    }
  }
  return merged;
};

// 空行を除く。末尾改行由来の空要素を落とす
export const splitLines = (text) => text.split('\n').filter((line) => line.trim() !== '');

const main = () => {
  const [, , , oursPath, theirsPath] = process.argv;
  if (!oursPath || !theirsPath) {
    console.error('usage: merge-driver.mjs <ancestor> <ours> <theirs>');
    process.exit(1);
  }
  let oursText;
  let theirsText;
  try {
    oursText = fs.readFileSync(oursPath, 'utf8');
    theirsText = fs.readFileSync(theirsPath, 'utf8');
  } catch {
    // 読み失敗時は非0で抜け、git の通常コンフリクトへ委譲する
    process.exit(1);
  }
  const merged = mergeLines(splitLines(oursText), splitLines(theirsText));
  fs.writeFileSync(oursPath, merged.length === 0 ? '' : `${merged.join('\n')}\n`);
};

// import 時は実行せず、直接実行時のみ main を呼ぶ
const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
