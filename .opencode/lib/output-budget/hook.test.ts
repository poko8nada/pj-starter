// Boundary tests for the output-budget hook.
// 予算フックの境界テスト（日本語補足：短文素通りと長文切り詰めを確認）。
import { describe, expect, it } from 'vitest';
import { applyBudgetToOutput, shouldApplyBudget } from './hook';
import { OUTPUT_BUDGET_LINES } from './budget';

const makeLines = (n: number): string =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('shouldApplyBudget', () => {
  it('applies only to bash', () => {
    expect(shouldApplyBudget({ tool: 'bash' })).toBe(true);
    expect(shouldApplyBudget({ tool: 'read' })).toBe(false);
    expect(shouldApplyBudget({})).toBe(false);
  });
});

describe('applyBudgetToOutput', () => {
  it('passes through short bash output', () => {
    expect(applyBudgetToOutput({ tool: 'bash' }, 'ok')).toBeNull();
  });

  it('ignores non-bash tools even when long', () => {
    expect(applyBudgetToOutput({ tool: 'read' }, makeLines(OUTPUT_BUDGET_LINES + 10))).toBeNull();
  });

  it('truncates long bash output and saves the full text', () => {
    const total = OUTPUT_BUDGET_LINES + 10;
    const result = applyBudgetToOutput({ tool: 'bash' }, makeLines(total));
    expect(typeof result).toBe('string');
    if (typeof result === 'string') {
      expect(result).toContain('[output-budget]');
      expect(result).toContain('full output saved to');
      expect(result).not.toContain(`line ${total}`);
    }
  });

  it('passes through empty output', () => {
    expect(applyBudgetToOutput({ tool: 'bash' }, '')).toBeNull();
  });

  it('passes through non-string output without throwing', () => {
    expect(applyBudgetToOutput({ tool: 'bash' }, 123)).toBeNull();
    expect(applyBudgetToOutput({ tool: 'bash' }, null)).toBeNull();
  });
});
