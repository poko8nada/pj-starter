// 冗長出力を静かな既定に抑える一元表（増やすときは VERBOSE_PATTERNS に1行足すだけ）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Report } from '../utils/shared';
import { clipLines, MAX_REPORT_LINES } from '../utils/text';

export interface VerbosePattern {
  name: string;
  pattern: RegExp;
  quiet: string;
}

// 冗長呼び出しの一元登録（v1は5件に絞り誤検知を避ける）。
export const VERBOSE_PATTERNS: VerbosePattern[] = [
  {
    name: 'vitest-reporter',
    pattern: /\bvitest\b.*--reporter(?:=|\s+)(verbose|default)\b/,
    quiet: 'plain vitest run / TEST_VERBOSE=1',
  },
  {
    name: 'generic-verbose',
    pattern: /(?:^|\s)(?:--verbose\b|--debug\b|-vv+\b)/,
    quiet: 'drop the flag',
  },
  {
    name: 'tsc-list',
    pattern: /\btsc\b.*--(listFiles|traceResolution|extendedDiagnostics)\b/,
    quiet: 'narrow the target',
  },
  {
    name: 'ls-recursive',
    pattern: /\bls\b(?:\s+-[a-zA-Z]+)*\s+-[a-zA-Z]*R[a-zA-Z]*\b/,
    quiet: 'narrow the directory',
  },
  {
    name: 'git-verbose',
    pattern: /\bgit\s+(log|show)\b.*(?:^|\s)(?:-p|--patch|--stat)(?:\s|$)/,
    quiet: 'narrow the range',
  },
];

// 新しい上限を増やさず既存の報告上限を再利用する。
export const OUTPUT_BUDGET_LINES = MAX_REPORT_LINES;

// いずれかの冗長パターンに当たるとき真。
export const isVerboseCommand = (command: unknown): boolean => {
  if (typeof command !== 'string') return false;
  return VERBOSE_PATTERNS.some((entry) => entry.pattern.test(command));
};

// 旧verbose-guide面の別名（配線切替の移行用）。
export const isVerboseVitest = isVerboseCommand;

// 冗長な実行には案内を返し、それ以外は空報告を返す。
export const buildQuietGuide = (command: unknown): Report => {
  if (typeof command !== 'string') return { errors: [] };
  const hit = VERBOSE_PATTERNS.find((entry) => entry.pattern.test(command));
  if (!hit) return { errors: [] };
  return {
    errors: [
      `[quiet-policy:${hit.name}] Verbose invocation detected. Quiet output is the default (${hit.quiet}); set TEST_VERBOSE=1 instead when full output is needed.`,
    ],
  };
};

// 旧verbose-guide面の別名（配線切替の移行用）。
export const buildVerboseGuide = buildQuietGuide;

// 空行を除いて数える（clipLines と同一基準）。
export const countContentLines = (text: string): number => {
  if (text === '') return 0;
  return text.split('\n').filter((line) => line.trim() !== '').length;
};

// 予算超過かどうかを判定する。
export const isOverBudget = (text: string, max: number = OUTPUT_BUDGET_LINES): boolean => {
  return countContentLines(text) > max;
};

// 予算内はそのまま返し、超過時は要約ヘッダ＋先頭抜粋を返す。
export const applyBudget = (text: string, max: number = OUTPUT_BUDGET_LINES): string => {
  if (!isOverBudget(text, max)) return text;
  const total = countContentLines(text);
  const clipped = clipLines(text, max);
  return `[quiet-policy] ${total} lines → showing first ${max} lines\n${clipped}`;
};

export interface BudgetAfterInput {
  tool?: unknown;
}

// v1では他ツールへ影響しないようbash出力のみ対象にする。
export const shouldApplyBudget = (input: BudgetAfterInput): boolean => {
  return input.tool === 'bash';
};

// 全文をtmpへ保存する（ベストエフォート）。成功時はパス、失敗時はnull。
const saveFullOutput = (full: string): string | null => {
  try {
    const file = path.join(
      os.tmpdir(),
      `quiet-policy-${Date.now()}-${Math.floor(Math.random() * 10000)}.log`,
    );
    fs.writeFileSync(file, full, 'utf8');
    return file;
  } catch {
    return null;
  }
};

// 予算超過時は全文退避つきの書き換え結果を返し、それ以外はnull（変更なし）。
// TEST_VERBOSE=1は抜け道：デバッグ時は切り詰めず素通しする。
export const applyBudgetToOutput = (
  input: BudgetAfterInput,
  outputText: unknown,
): string | null => {
  if (process.env.TEST_VERBOSE === '1') return null;
  if (!shouldApplyBudget(input)) return null;
  if (typeof outputText !== 'string' || outputText === '') return null;
  if (!isOverBudget(outputText)) return null;
  const truncated = applyBudget(outputText);
  const saved = saveFullOutput(outputText);
  if (saved === null) return truncated;
  return `${truncated}\n[quiet-policy] full output saved to ${saved}`;
};
