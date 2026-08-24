// buildIdleMessage のテスト。整形済みエラーメッセージを連結し、空なら null を返す
import { describe, expect, it } from 'vitest';
import { buildIdleMessage } from './message';
import type { Report } from './report';

describe('buildIdleMessage', () => {
  it('returns null when nothing to report', () => {
    expect(buildIdleMessage({ errors: [] }, { errors: [] })).toBeNull();
  });

  it('concatenates errors across reports in order', () => {
    const review: Report = { errors: ['[lint] x'] };
    const sync: Report = { errors: ['[audit] component has no path'] };
    const text = buildIdleMessage(review, sync);
    expect(text).toContain('[lint] x');
    expect(text).toContain('[audit] component has no path');
    expect((text ?? '').indexOf('[lint]')).toBeLessThan((text ?? '').indexOf('[audit]'));
  });
});
