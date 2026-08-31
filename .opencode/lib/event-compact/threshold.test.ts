// threshold.ts のテスト
import { describe, expect, it } from 'vitest';
import { COMPACTION_THRESHOLD, shouldCompact } from './threshold';

describe('shouldCompact', () => {
  it('compacts at or above the threshold', () => {
    expect(shouldCompact(COMPACTION_THRESHOLD)).toBe(true);
    expect(shouldCompact(COMPACTION_THRESHOLD + 1)).toBe(true);
  });

  it('does not compact below the threshold', () => {
    expect(shouldCompact(COMPACTION_THRESHOLD - 1)).toBe(false);
    expect(shouldCompact(0)).toBe(false);
  });

  it('accepts a custom threshold', () => {
    expect(shouldCompact(5, 5)).toBe(true);
    expect(shouldCompact(4, 5)).toBe(false);
  });
});
