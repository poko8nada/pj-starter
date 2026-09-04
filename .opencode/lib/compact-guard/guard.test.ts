// コンパクト実行検出のテスト。bash コマンド文字列から compact.mjs の起動を判定する
import { describe, expect, it } from 'vitest';
import { isCompactCommand } from './guard';

describe('isCompactCommand', () => {
  it('matches a direct compact invocation', () => {
    expect(isCompactCommand('node events/scripts/compact.mjs')).toBe(true);
  });

  it('matches with flags', () => {
    expect(isCompactCommand('node events/scripts/compact.mjs --user-confirmed')).toBe(true);
  });

  it('matches with an env prefix', () => {
    expect(isCompactCommand('EVENTS_DIR=x node events/scripts/compact.mjs')).toBe(true);
  });

  it('does not match other scripts', () => {
    expect(isCompactCommand('node events/scripts/build.mjs')).toBe(false);
    expect(isCompactCommand('node events/scripts/append.mjs --set a b')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isCompactCommand(undefined)).toBe(false);
    expect(isCompactCommand(null)).toBe(false);
    expect(isCompactCommand(42)).toBe(false);
  });
});
