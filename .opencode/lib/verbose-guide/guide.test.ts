// Unit tests for the verbose-guide detection (pure logic).
// 誘導判定の単体テスト（日本語補足：検出・素通りの境界を確認）。
import { describe, expect, it } from 'vitest';
import { buildVerboseGuide, isVerboseVitest } from './guide';

describe('isVerboseVitest', () => {
  it('detects verbose reporter in equals and space forms', () => {
    expect(isVerboseVitest('pnpm vitest run --reporter=verbose')).toBe(true);
    expect(isVerboseVitest('pnpm vitest run --reporter verbose')).toBe(true);
    expect(isVerboseVitest('vitest run --reporter=default')).toBe(true);
  });

  it('passes through quiet invocations', () => {
    expect(isVerboseVitest('pnpm test:run')).toBe(false);
    expect(isVerboseVitest('pnpm vitest run')).toBe(false);
    expect(isVerboseVitest('pnpm vitest run --reporter=dot')).toBe(false);
    expect(isVerboseVitest('TEST_VERBOSE=1 pnpm vitest run')).toBe(false);
  });

  it('passes through non-string commands and non-vitest tools', () => {
    expect(isVerboseVitest(undefined)).toBe(false);
    expect(isVerboseVitest(123)).toBe(false);
    expect(isVerboseVitest('pnpm eslint --reporter=verbose')).toBe(false);
  });
});

describe('buildVerboseGuide', () => {
  it('returns guidance pointing at TEST_VERBOSE=1', () => {
    const report = buildVerboseGuide('pnpm vitest run --reporter=verbose');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('TEST_VERBOSE=1');
  });

  it('returns an empty report for quiet invocations', () => {
    expect(buildVerboseGuide('pnpm vitest run')).toEqual({ errors: [] });
  });
});
