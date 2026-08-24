// dirty フラグの TTL テスト。期限切れの dirty は無視され、ループを防ぐ
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeDirty, markDirty } from './edit-lint.hook';

const DIRTY_TTL_MS = 5 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
  consumeDirty();
});

describe('dirty flag TTL', () => {
  it('consumes a fresh dirty flag', () => {
    markDirty();
    expect(consumeDirty()).toBe(true);
  });

  it('returns false when nothing is dirty', () => {
    expect(consumeDirty()).toBe(false);
  });

  it('ignores a dirty flag older than the TTL', () => {
    vi.useFakeTimers();
    markDirty();
    vi.advanceTimersByTime(DIRTY_TTL_MS + 1);
    expect(consumeDirty()).toBe(false);
  });

  it('consumes a dirty flag within the TTL', () => {
    vi.useFakeTimers();
    markDirty();
    vi.advanceTimersByTime(DIRTY_TTL_MS - 1);
    expect(consumeDirty()).toBe(true);
  });
});
