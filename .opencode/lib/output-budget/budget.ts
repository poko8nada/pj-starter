// Generic output budget (pure logic). Trims long command outputs to save tokens.
// 長いコマンド出力を要約形に切り詰める純粋ロジック（日本語補足：全文保存は呼び出し側が担う）。
import { clipLines, MAX_REPORT_LINES } from '../utils/text';

// Reuse the existing report limit so there is only one tuning knob.
// 新しい上限を増やさず既存の報告上限を再利用する。
export const OUTPUT_BUDGET_LINES = MAX_REPORT_LINES;

// Count content lines with the same rule as clipLines (skip blank lines).
// 空行を除いて数える（clipLines と同一基準）。
export const countContentLines = (text: string): number => {
  if (text === '') return 0;
  return text.split('\n').filter((line) => line.trim() !== '').length;
};

// True when the output exceeds the budget.
// 予算超過かどうかを判定する。
export const isOverBudget = (text: string, max: number = OUTPUT_BUDGET_LINES): boolean => {
  return countContentLines(text) > max;
};

// Return the original text when under budget, otherwise a header plus clipped body.
// 予算内はそのまま返し、超過時は要約ヘッダ＋先頭抜粋を返す。
export const applyBudget = (text: string, max: number = OUTPUT_BUDGET_LINES): string => {
  if (!isOverBudget(text, max)) return text;
  const total = countContentLines(text);
  const clipped = clipLines(text, max);
  return `[output-budget] ${total} lines → showing first ${max} lines\n${clipped}`;
};
