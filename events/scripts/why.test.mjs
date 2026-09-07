// events/scripts/lib/why.mjs の append 時展開に関するテスト
import { describe, expect, it } from 'vitest';
import { expandWhyOps } from './lib.mjs';

const ts = '2026-09-08T12:00:00.123+09:00';

describe('expandWhyOps', () => {
  it('bundles same-invocation why/whyNot into one timestamped entry', () => {
    expect(
      expandWhyOps(
        [
          { type: 'set', key: 'product.stack.why', value: '速い' },
          { type: 'set', key: 'product.stack.whyNot', value: 'npm は遅い' },
        ],
        ts,
      ),
    ).toEqual([
      {
        type: 'set',
        key: 'product.stack.why.20260908T120000123',
        value: { why: '速い', whyNot: 'npm は遅い' },
      },
    ]);
  });

  it('expands a lone why into a why-only entry', () => {
    expect(
      expandWhyOps([{ type: 'set', key: 'meta.skills.agenda.why', value: '記録' }], ts),
    ).toEqual([
      { type: 'set', key: 'meta.skills.agenda.why.20260908T120000123', value: { why: '記録' } },
    ]);
  });

  it('rejects a lone whyNot and duplicate intents', () => {
    expect(() =>
      expandWhyOps([{ type: 'set', key: 'product.stack.whyNot', value: 'x' }], ts),
    ).toThrow(/whyNot without why/);
    expect(() =>
      expandWhyOps(
        [
          { type: 'set', key: 'product.stack.why', value: 'a' },
          { type: 'set', key: 'product.stack.why', value: 'b' },
        ],
        ts,
      ),
    ).toThrow(/duplicate why/);
    expect(() =>
      expandWhyOps(
        [
          { type: 'set', key: 'product.stack.why', value: 'a' },
          { type: 'set', key: 'product.stack.whyNot', value: 'x' },
          { type: 'set', key: 'product.stack.whyNot', value: 'y' },
        ],
        ts,
      ),
    ).toThrow(/duplicate whyNot/);
  });

  it('passes through non-why ops and malformed drafts untouched', () => {
    const drafts = [
      { type: 'set', key: 'product.name.value', value: 'X' },
      { type: 'del', key: 'product.stack.why' },
      { type: 'set', key: 'product.stack.why', value: { why: '旧形状' } },
      {
        type: 'set',
        key: 'product.stack.why.20260908T120000123',
        value: { why: '移行エントリ' },
      },
    ];
    expect(expandWhyOps(drafts, ts)).toEqual(drafts);
  });

  it('rejects a ts that cannot yield an entry id', () => {
    expect(() =>
      expandWhyOps([{ type: 'set', key: 'product.stack.why', value: 'x' }], 'nope'),
    ).toThrow(/cannot derive a why entry id/);
  });
});
