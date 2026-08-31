// buildMessage のテスト。整形済みエラーメッセージを連結し、空なら null を返す
import { describe, expect, it } from 'vitest';
import { buildMessage } from './message';
import type { Report } from './shared';

describe('buildMessage', () => {
  it('returns null when nothing to report', () => {
    expect(buildMessage('prefix', { errors: [] }, { errors: [] })).toBeNull();
    expect(buildMessage({ errors: [] })).toBeNull();
    expect(buildMessage()).toBeNull();
  });

  it('concatenates errors across reports in order', () => {
    const review: Report = { errors: ['[lint] x'] };
    const sync: Report = { errors: ['[audit] component has no path'] };
    const text = buildMessage('PREFIX', review, sync);
    expect(text).toBe('PREFIX\n\n[lint] x\n\n[audit] component has no path');
  });

  it('prepends the prefix', () => {
    const text = buildMessage('PREFIX', { errors: ['x'] });
    expect(text).toBe('PREFIX\n\nx');
  });

  it('returns the body only when the prefix is omitted', () => {
    const text = buildMessage({ errors: ['x'] });
    expect(text).toBe('x');
  });
});
