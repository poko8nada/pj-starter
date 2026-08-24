// コンパクション要否判定のテスト
import { describe, expect, it } from 'vitest';
import { COMPACTION_THRESHOLD, shouldCompact } from './threshold';

describe('shouldCompact', () => {
  it('does not compact below the threshold', () => {
    expect(shouldCompact(COMPACTION_THRESHOLD - 1)).toBe(false);
    expect(shouldCompact(0)).toBe(false);
  });

  it('compacts at the threshold', () => {
    expect(shouldCompact(COMPACTION_THRESHOLD)).toBe(true);
    expect(shouldCompact(COMPACTION_THRESHOLD + 1)).toBe(true);
  });

  it('accepts a custom threshold', () => {
    expect(shouldCompact(3, 3)).toBe(true);
    expect(shouldCompact(2, 3)).toBe(false);
  });
});
