// 自動修正ラウンド管理のテスト
import { describe, expect, it } from 'vitest';
import { createRounds, MAX_AUTO_FIX_ROUNDS } from './rounds';

describe('createRounds', () => {
  it('starts at zero for unknown sessions', () => {
    const rounds = createRounds();
    expect(rounds.next('s1')).toBe(0);
    expect(rounds.exhausted('s1')).toBe(false);
  });

  it('advances per session independently', () => {
    const rounds = createRounds();
    rounds.advance('s1');
    rounds.advance('s1');
    rounds.advance('s2');
    expect(rounds.next('s1')).toBe(2);
    expect(rounds.next('s2')).toBe(1);
  });

  it('becomes exhausted at the cap', () => {
    const rounds = createRounds();
    for (let i = 0; i < MAX_AUTO_FIX_ROUNDS; i++) rounds.advance('s1');
    expect(rounds.exhausted('s1')).toBe(true);
  });

  it('resets on success', () => {
    const rounds = createRounds();
    rounds.advance('s1');
    rounds.reset('s1');
    expect(rounds.next('s1')).toBe(0);
    expect(rounds.exhausted('s1')).toBe(false);
  });
});
