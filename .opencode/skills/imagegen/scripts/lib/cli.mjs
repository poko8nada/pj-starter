#!/usr/bin/env node
// cli.mjs — generate.mjs / edit.mjs が共有する CLI 用の純粋ヘルパー。
// 引数検証とファイル名生成を重複させないために分離する。

import { resolveOutDir } from './api.mjs';
import { DRAFT_MODEL } from './params.mjs';

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

// edit.mjs の出力先を決定する: draft（muse）は下書き更新なので tmp/、
// photo/illustration は最終成果物なので imagegen/。--out 指定が最優先。
// --model 単独指定にも対応するため、解決後の model で判定する。
export function resolveEditOutDir({ model, out, cwd }) {
  if (out) return out;
  const isFinal = model !== DRAFT_MODEL;
  return resolveOutDir({ final: isFinal, cwd });
}
