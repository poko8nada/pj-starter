#!/usr/bin/env node
// cli.mjs — generate.mjs / refine.mjs が共有する CLI 用の純粋ヘルパー。
// 引数検証とファイル名生成を重複させないために分離する。

// --n のような正の整数フラグを検証してパースする
export function parsePositiveInt(flag, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} requires a positive integer, got "${value}"`);
  }
  return n;
}

// プロンプトから安全なファイル名用スラグを生成する
export function slug(prompt) {
  const stem = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return stem || 'image';
}
