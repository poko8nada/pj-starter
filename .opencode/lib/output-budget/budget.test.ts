// Unit tests for the generic output budget (pure logic).
// 出力予算の純粋ロジックのテスト（日本語補足：境界値を重点確認）。
import { describe, expect, it } from 'vitest';
import { applyBudget, countContentLines, isOverBudget, OUTPUT_BUDGET_LINES } from './budget';

const makeLines = (n: number): string =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('countContentLines', () => {
  it('counts empty string as zero', () => {
    expect(countContentLines('')).toBe(0);
  });

  it('skips blank lines like clipLines', () => {
    expect(countContentLines('a\n\n  \nb')).toBe(2);
  });
});

describe('isOverBudget', () => {
  it('returns false for short text', () => {
    expect(isOverBudget('a\nb')).toBe(false);
  });

  it('returns false at exactly the budget', () => {
    expect(isOverBudget(makeLines(OUTPUT_BUDGET_LINES))).toBe(false);
  });

  it('returns true just over the budget', () => {
    expect(isOverBudget(makeLines(OUTPUT_BUDGET_LINES + 1))).toBe(true);
  });
});

describe('applyBudget', () => {
  it('returns short text unchanged', () => {
    const text = 'ok\nall green';
    expect(applyBudget(text)).toBe(text);
  });

  it('truncates long text with a summary header', () => {
    const total = OUTPUT_BUDGET_LINES + 5;
    const result = applyBudget(makeLines(total));
    expect(result).toContain(
      `[output-budget] ${total} lines → showing first ${OUTPUT_BUDGET_LINES} lines`,
    );
    expect(result).toContain('line 1');
    expect(result).not.toContain(`line ${total}`);
  });
});
