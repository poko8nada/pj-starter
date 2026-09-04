// Detect explicitly verbose vitest invocations and guide to the quiet default.
// 冗長な呼び出しを検出し静かな既定へ誘導する純粋判定（日本語補足：抜け道はTEST_VERBOSE=1）。
import type { Report } from '../utils/shared';

const VITEST_PATTERN = /\bvitest\b/;
const VERBOSE_REPORTER_PATTERN = /--reporter(?:=|\s+)(verbose|default)\b/;

// True when the command explicitly opts into a verbose reporter.
// 明示的なverbose指定のときだけ真（素のvitest runは静かな既定のため対象外）。
export const isVerboseVitest = (command: unknown): boolean =>
  typeof command === 'string' &&
  VITEST_PATTERN.test(command) &&
  VERBOSE_REPORTER_PATTERN.test(command);

// Return a guidance report for verbose runs, otherwise an empty report.
// 冗長な実行には案内を返し、それ以外は空報告を返す。
export const buildVerboseGuide = (command: unknown): Report => {
  if (!isVerboseVitest(command)) return { errors: [] };
  return {
    errors: [
      '[verbose-guide] Explicit verbose reporter detected. Quiet output is the default; set TEST_VERBOSE=1 instead of --reporter when full output is needed.',
    ],
  };
};
