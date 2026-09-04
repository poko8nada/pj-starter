// Boundary handling that applies the output budget to tool outputs.
// ツール出力へ予算を適用する境界処理（日本語補足：全文はtmpへ退避し要約のみ返す）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyBudget, isOverBudget } from './budget';

export interface BudgetAfterInput {
  tool?: unknown;
}

// Only bash outputs are budgeted in v1 to avoid touching other tools.
// v1では他ツールへ影響しないようbash出力のみ対象にする。
export const shouldApplyBudget = (input: BudgetAfterInput): boolean => {
  return input.tool === 'bash';
};

// Return rewritten output when over budget, otherwise null (no change).
// 予算超過時は全文退避つきの書き換え結果を返し、それ以外はnull（変更なし）。
// Save the full output to tmp (best-effort). Return the file path or null on failure.
// 全文をtmpへ保存する（ベストエフォート）。成功時はパス、失敗時はnull。
const saveFullOutput = (full: string): string | null => {
  try {
    const file = path.join(
      os.tmpdir(),
      `output-budget-${Date.now()}-${Math.floor(Math.random() * 10000)}.log`,
    );
    fs.writeFileSync(file, full, 'utf8');
    return file;
  } catch {
    return null;
  }
};

export const applyBudgetToOutput = (
  input: BudgetAfterInput,
  outputText: unknown,
): string | null => {
  if (!shouldApplyBudget(input)) return null;
  if (typeof outputText !== 'string' || outputText === '') return null;
  if (!isOverBudget(outputText)) return null;
  const truncated = applyBudget(outputText);
  const saved = saveFullOutput(outputText);
  if (saved === null) return truncated;
  return `${truncated}\n[output-budget] full output saved to ${saved}`;
};
