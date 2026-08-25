// events/scripts/lib.mjs の畳み込み意味論とstatus検証に関するテスト
import { describe, expect, it } from 'vitest';
import {
  buildEvent,
  deletePath,
  EventError,
  injectUpdatedAt,
  normalizeTrees,
  setPath,
  stableStringify,
} from './lib.mjs';

describe('buildEvent', () => {
  it('builds a set event with a JST timestamp', () => {
    const event = buildEvent({ type: 'set', key: 'product.name', value: 'x' });
    expect(event.type).toBe('set');
    expect(event.key).toBe('product.name');
    expect(event.value).toBe('x');
    expect(event.ts).toMatch(/\+09:00$/);
  });

  it('rejects unknown types', () => {
    expect(() => buildEvent({ type: 'nope', key: 'product.name' })).toThrow(EventError);
  });

  it('rejects invalid product sections', () => {
    expect(() => buildEvent({ type: 'set', key: 'product.bad.x', value: 1 })).toThrow(EventError);
  });

  it('rejects the removed agenda namespace', () => {
    expect(() => buildEvent({ type: 'set', key: 'agenda.uw-001', value: {} })).toThrow(EventError);
  });

  it('accepts an explicit ts so one invocation shares one timestamp', () => {
    const ts = '2026-08-25T00:00:00.000+09:00';
    const event = buildEvent({ type: 'set', key: 'product.name', value: 'x' }, ts);
    expect(event.ts).toBe(ts);
  });

  it('requires a value for set but not for del', () => {
    expect(() => buildEvent({ type: 'set', key: 'product.name' })).toThrow(EventError);
    expect(buildEvent({ type: 'del', key: 'product.name' }).value).toBeUndefined();
  });
});

describe('status key validation', () => {
  it('accepts a fact-section status path', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'product.stack.status', value: { text: 'pnpm を追加' } }),
    ).not.toThrow();
  });

  it('accepts work-unit status paths for both namespaces', () => {
    const value = { stage: 'ready', text: '実装待ち' };
    expect(() =>
      buildEvent({ type: 'set', key: 'product.features.auth.status', value }),
    ).not.toThrow();
    expect(() =>
      buildEvent({ type: 'set', key: 'meta.skills.agenda.status', value }),
    ).not.toThrow();
  });

  it('rejects status on collection containers and meta sections', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'product.features.status', value: { text: 'x' } }),
    ).toThrow(/only allowed/);
    expect(() =>
      buildEvent({ type: 'set', key: 'meta.harness.status', value: { text: 'x' } }),
    ).toThrow(/only allowed/);
  });

  it('rejects status deeper than section roots or work units', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'product.stack.build.status', value: { text: 'x' } }),
    ).toThrow(/only allowed/);
  });

  it('rejects partial writes below status', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'product.features.auth.status.stage', value: 'ready' }),
    ).toThrow(/asserted whole/);
    expect(() => buildEvent({ type: 'del', key: 'product.stack.status.text' })).toThrow(
      /asserted whole/,
    );
  });

  it('allows deleting a whole status', () => {
    expect(() => buildEvent({ type: 'del', key: 'product.stack.status' })).not.toThrow();
  });
});

describe('status value validation', () => {
  it('requires exactly {text} on fact sections', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'product.what.status', value: { text: '確定' } }),
    ).not.toThrow();
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'product.what.status',
        value: { stage: 'ready', text: '確定' },
      }),
    ).toThrow(/without stage/);
    expect(() =>
      buildEvent({ type: 'set', key: 'product.what.status', value: { note: '確定' } }),
    ).toThrow(/exactly \{text\}/);
  });

  it('requires exactly {stage, text} on work units', () => {
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'meta.skills.audit.status',
        value: { stage: 'implement', text: '実装中' },
      }),
    ).not.toThrow();
    expect(() =>
      buildEvent({ type: 'set', key: 'meta.skills.audit.status', value: { text: '実装中' } }),
    ).toThrow(/\{stage, text\}/);
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'meta.skills.audit.status',
        value: { stage: 'ready', text: 'x', extra: 1 },
      }),
    ).toThrow(/\{stage, text\}/);
  });

  it('rejects stages outside the unified vocabulary', () => {
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'product.features.auth.status',
        value: { stage: 'done', text: 'x' },
      }),
    ).toThrow(/stage must be one of/);
  });

  it('rejects non-object and empty-text statuses', () => {
    expect(() => buildEvent({ type: 'set', key: 'product.name.status', value: '確定' })).toThrow(
      /must be an object/,
    );
    expect(() =>
      buildEvent({ type: 'set', key: 'product.name.status', value: { text: '' } }),
    ).toThrow(/non-empty string/);
  });
});

describe('setPath', () => {
  it('creates nested objects along the path', () => {
    const tree = {};
    setPath(tree, 'product.features.auth', { trigger: 't' });
    expect(tree.product.features.auth).toEqual({ trigger: 't' });
  });

  it('replaces a scalar intermediate with an object', () => {
    const tree = { product: { name: 'x' } };
    setPath(tree, 'product.name.en', 'X');
    expect(tree.product.name).toEqual({ en: 'X' });
  });
});

describe('deletePath', () => {
  it('removes the leaf and prunes empty ancestors', () => {
    const tree = { product: { features: { auth: { trigger: 't' } } } };
    deletePath(tree, 'product.features.auth');
    expect(tree).toEqual({ product: {} });
  });

  it('keeps siblings when pruning', () => {
    const tree = { product: { features: { a: {}, b: { keep: true } } } };
    deletePath(tree, 'product.features.a');
    expect(tree.product.features).toEqual({ b: { keep: true } });
  });
});

describe('normalizeTrees', () => {
  it('injects default status into work units of both namespaces', () => {
    const trees = {
      product: { features: { auth: { trigger: 't', result: 'r', route: [] } } },
      meta: { skills: { audit: { purpose: 'p' } } },
    };
    normalizeTrees(trees);
    expect(trees.product.features.auth.status).toEqual({ stage: 'planned', text: '未着手' });
    expect(trees.meta.skills.audit.status).toEqual({ stage: 'planned', text: '未着手' });
  });

  it('keeps explicitly set status and fills only missing fields', () => {
    const trees = {
      product: {},
      meta: {
        harness: {
          gate: { purpose: 'p', status: { stage: 'commit' } },
        },
      },
    };
    normalizeTrees(trees);
    expect(trees.meta.harness.gate.status).toEqual({ stage: 'commit', text: '未着手' });
  });

  it('ignores non-work-unit nodes', () => {
    const trees = {
      product: { stack: { runtime: 'Node.js' }, features: { plain: { note: 'not a slice' } } },
      meta: { docs: { plain: { note: 'not a component' } } },
    };
    normalizeTrees(trees);
    expect(trees.product.stack).toEqual({ runtime: 'Node.js' });
    expect(trees.product.features.plain).toEqual({ note: 'not a slice' });
    expect(trees.meta.docs.plain).toEqual({ note: 'not a component' });
  });

  it('rejects stages outside the vocabulary', () => {
    const trees = {
      product: {},
      meta: { skills: { x: { purpose: 'p', status: { stage: 'done', text: 'x' } } } },
    };
    expect(() => {
      normalizeTrees(trees);
    }).toThrow(/invalid stage/);
  });
});

describe('stableStringify', () => {
  it('is order-insensitive for object keys', () => {
    expect(stableStringify({ b: 1, a: [2, { z: 3, y: 4 }] })).toBe(
      stableStringify({ a: [2, { y: 4, z: 3 }], b: 1 }),
    );
  });
});

describe('injectUpdatedAt', () => {
  it('stamps status-bearing nodes from their latest own or descendant event', () => {
    const trees = {
      product: { name: { value: 'Pj Docs', status: { text: '確定' } } },
      meta: {},
    };
    const events = [
      { type: 'set', key: 'product.name', value: {}, ts: '2026-08-20T10:00:00+09:00' },
      { type: 'set', key: 'product.name.value', value: 'Pj Docs', ts: '2026-08-24T10:00:00+09:00' },
    ];
    injectUpdatedAt(trees, events);
    expect(trees.product.name.updatedAt).toBe('20260824');
  });

  it('walks through containers without status to find managed nodes', () => {
    const trees = {
      product: { features: { auth: { trigger: 't', status: { stage: 'ready', text: 'x' } } } },
      meta: {},
    };
    const events = [
      {
        type: 'set',
        key: 'product.features.auth.trigger',
        value: 't',
        ts: '2026-08-25T10:00:00+09:00',
      },
    ];
    injectUpdatedAt(trees, events);
    expect(trees.product.features.auth.updatedAt).toBe('20260825');
    expect(trees.product.features.updatedAt).toBeUndefined();
  });

  it('leaves raw nodes untouched', () => {
    const trees = { product: { stack: { runtime: 'Node.js' } }, meta: {} };
    const events = [
      {
        type: 'set',
        key: 'product.stack.runtime',
        value: 'Node.js',
        ts: '2026-08-24T10:00:00+09:00',
      },
    ];
    injectUpdatedAt(trees, events);
    expect(trees.product.stack.updatedAt).toBeUndefined();
  });

  it('keeps existing values when no events match', () => {
    const trees = {
      product: {},
      meta: {
        skills: {
          x: { purpose: 'p', status: { stage: 'planned', text: 'x' }, updatedAt: '20260101' },
        },
      },
    };
    injectUpdatedAt(trees, []);
    expect(trees.meta.skills.x.updatedAt).toBe('20260101');
  });
});
