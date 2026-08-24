// events/scripts/lib.mjs の畳み込み意味論に関するテスト
import { describe, expect, it } from 'vitest';
import {
  buildEvent,
  deletePath,
  EventError,
  normalizeFeatures,
  normalizeMeta,
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

  it('keeps the note field', () => {
    const event = buildEvent({ type: 'set', key: 'product.name', value: 'x', note: 'why' });
    expect(event.note).toBe('why');
  });

  it('rejects unknown types', () => {
    expect(() => buildEvent({ type: 'nope', key: 'product.name' })).toThrow(EventError);
  });

  it('rejects invalid product sections', () => {
    expect(() => buildEvent({ type: 'set', key: 'product.bad.x', value: 1 })).toThrow(EventError);
  });

  it('requires a value for set but not for del', () => {
    expect(() => buildEvent({ type: 'set', key: 'product.name' })).toThrow(EventError);
    expect(buildEvent({ type: 'del', key: 'product.name' }).value).toBeUndefined();
  });
});

describe('setPath', () => {
  it('creates nested objects along the path', () => {
    const tree = {};
    setPath(tree, 'product.features.auth', { status: 'planned' });
    expect(tree.product.features.auth).toEqual({ status: 'planned' });
  });

  it('replaces a scalar intermediate with an object', () => {
    const tree = { product: { name: 'x' } };
    setPath(tree, 'product.name.en', 'X');
    expect(tree.product.name).toEqual({ en: 'X' });
  });
});

describe('deletePath', () => {
  it('removes the leaf and prunes empty ancestors', () => {
    const tree = { product: { features: { auth: { status: 'planned' } } } };
    deletePath(tree, 'product.features.auth');
    expect(tree).toEqual({ product: {} });
  });

  it('keeps siblings when pruning', () => {
    const tree = { product: { features: { a: {}, b: { keep: true } } } };
    deletePath(tree, 'product.features.a');
    expect(tree.product.features).toEqual({ b: { keep: true } });
  });
});

describe('normalizeFeatures', () => {
  it('injects defaults into slice-like leaves only', () => {
    const features = {
      auth: { trigger: 't', result: 'r', route: ['a'] },
      nested: { notASlice: true },
    };
    normalizeFeatures(features);
    expect(features.auth).toEqual({
      trigger: 't',
      result: 'r',
      route: ['a'],
      status: 'planned',
    });
    expect(features.nested).toEqual({ notASlice: true });
  });

  it('keeps explicitly set values', () => {
    const features = {
      auth: { trigger: 't', result: 'r', route: [], status: 'commit' },
    };
    normalizeFeatures(features);
    expect(features.auth.status).toBe('commit');
  });
});

describe('normalizeMeta', () => {
  it('injects defaults into component leaves only', () => {
    const meta = {
      skills: { agenda: { purpose: 'p' } },
      docs: { plain: { note: 'not a component' } },
    };
    normalizeMeta(meta);
    expect(meta.skills.agenda).toEqual({ purpose: 'p', status: 'planned' });
    expect(meta.docs.plain).toEqual({ note: 'not a component' });
  });

  it('keeps explicitly set values', () => {
    const meta = {
      harness: { gate: { path: 'lefthook.yaml', purpose: 'gate', status: 'commit' } },
    };
    normalizeMeta(meta);
    expect(meta.harness.gate.status).toBe('commit');
  });
});

describe('stableStringify', () => {
  it('is order-insensitive for object keys', () => {
    expect(stableStringify({ b: 1, a: [2, { z: 3, y: 4 }] })).toBe(
      stableStringify({ a: [2, { y: 4, z: 3 }], b: 1 }),
    );
  });
});
