#!/usr/bin/env node
// log.jsonl 用の custom merge driver。親（theirs）のログをベースに、自ブランチのデルタ（branch フィールドが現在ブランチの行）を末尾へアペンドして結合する。
// 行は不透明なテキストとして扱い、デルタ判定のためだけに JSON 解釈する。
// 登録: pnpm setup:merge-driver（各cloneで一度実行する）
// 併せて .gitattributes が log.jsonl に本driver、生成物に keep 用driverを割当てる。
// 生成物は手解消せず build で再生成する。詳細は events/spec/machinery.md の Merge 節
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 現在ブランチ名を解決する。EVENTS_BRANCH があればそれを、無ければ git から読む。
// git が使えない（detached HEAD・非 git）場合は空文字
export const currentBranch = () => {
  if (process.env.EVENTS_BRANCH) return process.env.EVENTS_BRANCH;
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

// 自ブランチのデルタ（branch フィールドが currentBranch の行）を抽出する。
// 解釈不能な行はデルタに含めない（親側に残る共有履歴は theirs が持つ）
export const branchDelta = (oursLines, currentBranchName) =>
  oursLines.filter((line) => {
    try {
      return JSON.parse(line).branch === currentBranchName;
    } catch {
      return false;
    }
  });

// 親のログ（theirs）をベースに、自ブランチのデルタを末尾へアペンドする。
// 同一内容行は重複除去する。デルタが末尾に来るため、競合時は自ブランチが勝つ
export const mergeLines = (oursLines, theirsLines, currentBranchName) => {
  const delta = branchDelta(oursLines, currentBranchName);
  const seen = new Set(theirsLines);
  const merged = [...theirsLines];
  for (const line of delta) {
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
  const branch = currentBranch();
  if (!branch) {
    // ブランチを特定できないと自側のデルタを抽出できず、変更を黙って破棄してしまうため失敗させる
    console.error(
      'merge-driver: cannot resolve current branch (EVENTS_BRANCH unset and git unavailable)',
    );
    process.exit(1);
  }
  const merged = mergeLines(splitLines(oursText), splitLines(theirsText), branch);
  fs.writeFileSync(oursPath, merged.length === 0 ? '' : `${merged.join('\n')}\n`);
};

// import 時は実行せず、直接実行時のみ main を呼ぶ
const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
