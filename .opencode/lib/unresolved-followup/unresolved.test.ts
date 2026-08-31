// unresolved.ts の純粋ロジックのテスト。状態遷移（1回発火→スルー→復活）とメッセージ整形を検証する
import { afterEach, describe, expect, it } from 'vitest';
import { buildFollowupMessage, createFollowup, resetFollowup, tryFire } from './unresolved';

afterEach(() => {
  resetFollowup(createFollowup());
});

describe('tryFire / resetFollowup', () => {
  it('fires only once until reset', () => {
    const state = createFollowup();
    expect(tryFire(state)).toBe(true);
    expect(tryFire(state)).toBe(false);
    expect(tryFire(state)).toBe(false);
    resetFollowup(state);
    expect(tryFire(state)).toBe(true);
  });
});

describe('buildFollowupMessage', () => {
  it('builds a message from unresolved output', () => {
    const msg = buildFollowupMessage(
      '未確定のコンポーネントがあります:\n- meta.skills.x [ready] text',
    );
    expect(msg).toContain('[unresolved]');
    expect(msg).toContain('meta.skills.x');
    expect(msg).toContain('commit');
    expect(msg).toContain('del');
  });

  it('returns null when there is nothing unresolved', () => {
    expect(buildFollowupMessage('There are no unresolved components')).toBeNull();
    expect(buildFollowupMessage('')).toBeNull();
  });
});
