// yolo検知のテスト。展開文面の肯定・否定と合意トークンの正規化・除外を検証する
import { describe, expect, it } from 'vitest';
import { isAgreement, isYoloExpansion } from './detect';

const BODY = '# Workflow\nThis skill proposes steps.\n- `/workflow yolo` — Yolo mode';

describe('isYoloExpansion', () => {
  it('matches a workflow body with a trailing yolo argument', () => {
    expect(isYoloExpansion(`${BODY}\nyolo`)).toBe(true);
  });

  it('absorbs CRLF and trailing whitespace', () => {
    expect(isYoloExpansion(`${BODY}\r\nyolo   \r\n`)).toBe(true);
  });

  it('rejects a plain workflow expansion without the argument', () => {
    expect(isYoloExpansion(`${BODY}\n- **State** — snapshot status`)).toBe(false);
  });

  it('rejects a bare yolo without the skill body', () => {
    expect(isYoloExpansion('yolo')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isYoloExpansion(undefined)).toBe(false);
    expect(isYoloExpansion(null)).toBe(false);
    expect(isYoloExpansion(42)).toBe(false);
    expect(isYoloExpansion('')).toBe(false);
  });
});

describe('isAgreement', () => {
  it.each(['ok', 'OK', 'Ok', 'おｋ', 'おk', 'ＯＫ', '  ok  '])('matches %s', (input) => {
    expect(isAgreement(input)).toBe(true);
  });

  it('rejects longer messages to keep the armed state', () => {
    expect(isAgreement('おｋ、それはいいや')).toBe(false);
    expect(isAgreement('OKです')).toBe(false);
    expect(isAgreement('ok yolo')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isAgreement(undefined)).toBe(false);
    expect(isAgreement(null)).toBe(false);
    expect(isAgreement(42)).toBe(false);
    expect(isAgreement('')).toBe(false);
  });
});
