// 一元化ポリシーの単体・境界テスト（検出と予算の境界を確認）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  applyBudget,
  applyBudgetToOutput,
  buildQuietGuide,
  countContentLines,
  isOverBudget,
  isVerboseCommand,
  OUTPUT_BUDGET_LINES,
  shouldApplyBudget,
} from './policy';

const makeLines = (n: number): string =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('isVerboseCommand', () => {
  it('detects the v1 verbose patterns', () => {
    expect(isVerboseCommand('pnpm vitest run --reporter=verbose')).toBe(true);
    expect(isVerboseCommand('vitest run --reporter=default')).toBe(true);
    expect(isVerboseCommand('pnpm test --verbose')).toBe(true);
    expect(isVerboseCommand('pnpm lint --debug')).toBe(true);
    expect(isVerboseCommand('pnpm tsc --noEmit --listFiles')).toBe(true);
    expect(isVerboseCommand('ls -R')).toBe(true);
    expect(isVerboseCommand('git log -p -n 5')).toBe(true);
  });

  it('passes through quiet invocations', () => {
    expect(isVerboseCommand('pnpm vitest run')).toBe(false);
    expect(isVerboseCommand('pnpm test:run')).toBe(false);
    expect(isVerboseCommand('TEST_VERBOSE=1 pnpm vitest run')).toBe(false);
    expect(isVerboseCommand('ls -la')).toBe(false);
    expect(isVerboseCommand('git log --oneline -10')).toBe(false);
  });

  it('ignores flag-like substrings inside file paths', () => {
    expect(isVerboseCommand('ls -l /tmp/My-Report')).toBe(false);
    expect(isVerboseCommand('git log --oneline -- --stat-report.txt')).toBe(false);
  });

  it('passes through non-string commands', () => {
    expect(isVerboseCommand(undefined)).toBe(false);
    expect(isVerboseCommand(123)).toBe(false);
  });
});

describe('buildQuietGuide', () => {
  it('returns tagged guidance pointing at TEST_VERBOSE=1', () => {
    const report = buildQuietGuide('pnpm vitest run --reporter=verbose');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('[quiet-policy:');
    expect(report.errors[0]).toContain('TEST_VERBOSE=1');
  });

  it('returns an empty report for quiet invocations', () => {
    expect(buildQuietGuide('pnpm vitest run')).toEqual({ errors: [] });
  });
});

describe('countContentLines', () => {
  it('counts empty string as zero', () => {
    expect(countContentLines('')).toBe(0);
  });

  it('skips blank lines like clipLines', () => {
    expect(countContentLines('a\n\n  \nb')).toBe(2);
  });
});

describe('isOverBudget', () => {
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
      `[quiet-policy] ${total} lines → showing first ${OUTPUT_BUDGET_LINES} lines`,
    );
    expect(result).toContain('line 1');
    expect(result).not.toContain(`line ${total}`);
  });
});

describe('shouldApplyBudget', () => {
  it('applies only to bash', () => {
    expect(shouldApplyBudget({ tool: 'bash' })).toBe(true);
    expect(shouldApplyBudget({ tool: 'read' })).toBe(false);
    expect(shouldApplyBudget({})).toBe(false);
  });
});

describe('applyBudgetToOutput', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('passes through short bash output', () => {
    expect(applyBudgetToOutput({ tool: 'bash' }, 'ok')).toBeNull();
  });

  it('truncates long bash output and saves the full text', () => {
    const total = OUTPUT_BUDGET_LINES + 10;
    const result = applyBudgetToOutput({ tool: 'bash' }, makeLines(total));
    expect(typeof result).toBe('string');
    if (typeof result === 'string') {
      expect(result).toContain('[quiet-policy]');
      expect(result).toContain('full output saved to');
      expect(result).not.toContain(`line ${total}`);
    }
  });

  it('passes through empty and non-string output', () => {
    expect(applyBudgetToOutput({ tool: 'bash' }, '')).toBeNull();
    expect(applyBudgetToOutput({ tool: 'bash' }, 123)).toBeNull();
  });

  it('passes through long non-bash output without truncating', () => {
    expect(applyBudgetToOutput({ tool: 'read' }, makeLines(OUTPUT_BUDGET_LINES + 10))).toBeNull();
  });

  it('passes through long bash output when TEST_VERBOSE=1', () => {
    vi.stubEnv('TEST_VERBOSE', '1');
    expect(applyBudgetToOutput({ tool: 'bash' }, makeLines(OUTPUT_BUDGET_LINES + 10))).toBeNull();
  });

  it('returns clipped body only when tmp save fails', () => {
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('tmp unavailable');
    });
    const total = OUTPUT_BUDGET_LINES + 10;
    const result = applyBudgetToOutput({ tool: 'bash' }, makeLines(total));
    expect(typeof result).toBe('string');
    if (typeof result === 'string') {
      expect(result).toContain('[quiet-policy]');
      expect(result).not.toContain('full output saved to');
    }
  });
});
