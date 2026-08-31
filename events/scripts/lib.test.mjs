// events/scripts/lib.mjs の畳み込み意味論とstatus検証に関するテスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyFoldable,
  auditMetaIntegrity,
  buildEvent,
  deletePath,
  EventError,
  findUnresolved,
  injectUpdatedAt,
  lastFoldedTs,
  normalizeTrees,
  parseCheckpoint,
  setPath,
  stableStringify,
  stripHistory,
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

describe('parseCheckpoint', () => {
  it('parses a well-formed checkpoint', () => {
    const parsed = parseCheckpoint(
      '{"compactedAt":"2026-08-01T00:00:00.000+09:00","trees":{"product":{},"meta":{}}}',
    );
    expect(parsed.compactedAt).toBe('2026-08-01T00:00:00.000+09:00');
    expect(parsed.trees).toEqual({ product: {}, meta: {} });
  });

  it('falls back to absent for empty, invalid, or shape-broken text', () => {
    for (const text of [
      '',
      'not json',
      '{}',
      '[]',
      '{"noTrees":true}',
      '{"trees":null}',
      '{"trees":"x"}',
      '{"trees":[]}',
    ]) {
      expect(parseCheckpoint(text)).toBeNull();
    }
  });

  it('normalizes a missing compactedAt to null', () => {
    expect(parseCheckpoint('{"trees":{"product":{},"meta":{}}}').compactedAt).toBeNull();
  });
});

describe('normalizeTrees', () => {
  it('injects default status into product feature work units', () => {
    const trees = {
      product: { features: { auth: { trigger: 't', result: 'r', route: [] } } },
      meta: {},
    };
    normalizeTrees(trees);
    expect(trees.product.features.auth.status).toEqual({ stage: 'planned', text: '未着手' });
  });

  it('completes partial statuses on product features', () => {
    const trees = {
      product: { features: { a: { trigger: 't', status: 'broken' }, b: { trigger: 't' } } },
      meta: {},
    };
    normalizeTrees(trees);
    expect(trees.product.features.a.status).toEqual({ stage: 'planned', text: '未着手' });
    expect(trees.product.features.b.status).toEqual({ stage: 'planned', text: '未着手' });
  });

  it('leaves meta components raw as shipped baseline', () => {
    const trees = {
      product: {},
      meta: { skills: { audit: { path: '.opencode/x', purpose: 'p' } } },
    };
    normalizeTrees(trees);
    expect(trees.meta.skills.audit).toEqual({ path: '.opencode/x', purpose: 'p' });
  });

  it('does not touch meta nodes even with an out-of-vocabulary status', () => {
    const trees = {
      product: {},
      meta: { skills: { x: { purpose: 'p', status: { stage: 'done', text: 'x' } } } },
    };
    normalizeTrees(trees);
    expect(trees.meta.skills.x.status).toEqual({ stage: 'done', text: 'x' });
  });

  it('keeps explicitly set status and fills only missing fields', () => {
    const trees = {
      product: { features: { auth: { trigger: 't', status: { stage: 'commit' } } } },
      meta: {},
    };
    normalizeTrees(trees);
    expect(trees.product.features.auth.status).toEqual({ stage: 'commit', text: '未着手' });
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
      product: { features: { x: { trigger: 't', status: { stage: 'done', text: 'x' } } } },
      meta: {},
    };
    expect(() => {
      normalizeTrees(trees);
    }).toThrow(/invalid stage/);
  });
});

describe('log namespace', () => {
  const fileTry = { tool: 'edit', gap: 12000, targets: ['a.ts'] };
  const skillTry = { tool: 'skill', gap: 500, targets: ['agenda'] };
  const mcpTry = { tool: 'mcp_github_search', gap: 300, targets: ['mcp_github_search'] };

  it('accepts a well-formed file tool try', () => {
    expect(() => buildEvent({ type: 'set', key: 'log.try.a83f2', value: fileTry })).not.toThrow();
  });

  it('accepts a well-formed skill try', () => {
    expect(() => buildEvent({ type: 'set', key: 'log.try.a83f2', value: skillTry })).not.toThrow();
  });

  it('accepts mcp_* tools with the tool name as target', () => {
    expect(() => buildEvent({ type: 'set', key: 'log.try.a83f2', value: mcpTry })).not.toThrow();
  });

  it('allows deleting a log entry without a value', () => {
    expect(() => buildEvent({ type: 'del', key: 'log.try.a83f2' })).not.toThrow();
  });

  it('rejects malformed log keys on del too', () => {
    expect(() => buildEvent({ type: 'del', key: 'log.try' })).toThrow(/log\.try\.<id>/);
  });

  it('rejects malformed log keys', () => {
    expect(() => buildEvent({ type: 'set', key: 'log.try', value: fileTry })).toThrow(
      /log\.try\.<id>/,
    );
    expect(() => buildEvent({ type: 'set', key: 'log.try.a.b', value: fileTry })).toThrow(
      /log\.try\.<id>/,
    );
    expect(() => buildEvent({ type: 'set', key: 'log.turn.x', value: fileTry })).toThrow(
      /log\.try\.<id>/,
    );
    expect(() => buildEvent({ type: 'set', key: 'log.try.', value: fileTry })).toThrow(
      /log\.try\.<id>/,
    );
  });

  it('requires exactly {tool, gap, targets} in the value', () => {
    expect(() => buildEvent({ type: 'set', key: 'log.try.x', value: {} })).toThrow(
      /tool must be one of/,
    );
    expect(() =>
      buildEvent({ type: 'set', key: 'log.try.x', value: { tool: 'edit', gap: 0 } }),
    ).toThrow(/exactly \{tool, gap, targets\}/);
    expect(() => buildEvent({ type: 'set', key: 'log.try.x', value: 'x' })).toThrow(
      /must be an object/,
    );
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'edit', gap: 0, targets: ['a'], extra: 1 },
      }),
    ).toThrow(/exactly \{tool, gap, targets\}/);
  });

  it('rejects invalid tools and gaps', () => {
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'grep', gap: 0, targets: ['a'] },
      }),
    ).toThrow(/tool must be one of/);
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'edit', gap: -1, targets: ['a'] },
      }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'edit', gap: 1.5, targets: ['a'] },
      }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'edit', gap: '5', targets: ['a'] },
      }),
    ).toThrow(/non-negative integer/);
    expect(() =>
      buildEvent({
        type: 'set',
        key: 'log.try.x',
        value: { tool: 'edit', gap: null, targets: ['a'] },
      }),
    ).toThrow(/non-negative integer/);
  });

  it('rejects invalid targets', () => {
    expect(() =>
      buildEvent({ type: 'set', key: 'log.try.x', value: { tool: 'edit', gap: 0, targets: [] } }),
    ).toThrow(/non-empty string array/);
    expect(() =>
      buildEvent({ type: 'set', key: 'log.try.x', value: { tool: 'edit', gap: 0, targets: [''] } }),
    ).toThrow(/non-empty string array/);
    expect(() =>
      buildEvent({ type: 'set', key: 'log.try.x', value: { tool: 'edit', gap: 0, targets: [1] } }),
    ).toThrow(/non-empty string array/);
    expect(() =>
      buildEvent({ type: 'set', key: 'log.try.x', value: { tool: 'edit', gap: 0, targets: 'a' } }),
    ).toThrow(/non-empty string array/);
  });
});

describe('auditMetaIntegrity', () => {
  it('flags components in progress without a path', () => {
    const trees = {
      meta: {
        harness: {
          x: { purpose: 'p', status: { stage: 'ready', text: 't' } },
          y: { purpose: 'p', path: '.opencode/lib/y.ts', status: { stage: 'commit', text: 't' } },
        },
      },
    };
    const findings = auditMetaIntegrity(trees);
    expect(findings).toEqual(['meta component meta.harness.x is "ready" but has no path']);
  });

  it('flags implement and commit stages and empty paths', () => {
    const trees = {
      meta: {
        harness: {
          a: { purpose: 'p', status: { stage: 'implement', text: 't' } },
          b: { purpose: 'p', path: '', status: { stage: 'commit', text: 't' } },
        },
      },
    };
    const findings = auditMetaIntegrity(trees);
    expect(findings).toEqual([
      'meta component meta.harness.a is "implement" but has no path',
      'meta component meta.harness.b is "commit" but has no path',
    ]);
  });

  it('ignores components without status or with a path', () => {
    const trees = {
      meta: {
        harness: {
          raw: { purpose: 'p' },
          planned: { purpose: 'p', status: { stage: 'planned', text: 't' } },
          ok: {
            purpose: 'p',
            path: '.opencode/lib/ok.ts',
            status: { stage: 'implement', text: 't' },
          },
        },
      },
    };
    expect(auditMetaIntegrity(trees)).toEqual([]);
  });

  it('walks nested containers and ignores non-meta namespaces', () => {
    const trees = {
      product: { features: { f: { trigger: 't', status: { stage: 'ready', text: 't' } } } },
      meta: {
        skills: {
          group: {
            deep: { purpose: 'p', status: { stage: 'commit', text: 't' } },
          },
        },
      },
    };
    const findings = auditMetaIntegrity(trees);
    expect(findings).toEqual(['meta component meta.skills.group.deep is "commit" but has no path']);
  });

  it('returns an empty list for null or non-object trees', () => {
    expect(auditMetaIntegrity(null)).toEqual([]);
    expect(auditMetaIntegrity(undefined)).toEqual([]);
    expect(auditMetaIntegrity('x')).toEqual([]);
  });
});

describe('applyFoldable', () => {
  it('applies set and del for fold-participating namespaces', () => {
    const trees = { product: { features: { auth: { trigger: 't' } } }, meta: {} };
    applyFoldable(trees, [
      { type: 'set', key: 'meta.skills.x.purpose', value: 'p' },
      { type: 'del', key: 'product.features.auth' },
    ]);
    expect(trees.product).toEqual({ features: {} });
    expect(trees.meta.skills.x.purpose).toBe('p');
  });

  it('skips non-participating namespaces like log', () => {
    const trees = { product: {}, meta: {} };
    applyFoldable(trees, [
      { type: 'set', key: 'log.try.a', value: { tool: 'edit', gap: 0, targets: ['a'] } },
      { type: 'set', key: 'product.name.value', value: 'X' },
    ]);
    expect(trees.log).toBeUndefined();
    expect(trees.product.name.value).toBe('X');
  });

  it('skips log del events too', () => {
    const trees = { product: {}, meta: {} };
    applyFoldable(trees, [{ type: 'del', key: 'log.try.a' }]);
    expect(trees).toEqual({ product: {}, meta: {} });
  });
});

describe('lastFoldedTs', () => {
  it('ignores trailing log events when picking the newest folded ts', () => {
    const ts = lastFoldedTs([
      { type: 'set', key: 'product.name', ts: '2026-08-26T10:00:00.000+09:00' },
      { type: 'set', key: 'log.try.a', ts: '2026-08-26T10:05:00.000+09:00' },
    ]);
    expect(ts).toBe('2026-08-26T10:00:00.000+09:00');
  });

  it('returns an empty string when nothing folds', () => {
    const ts = lastFoldedTs([
      { type: 'set', key: 'log.try.a', ts: '2026-08-26T10:00:00.000+09:00' },
    ]);
    expect(ts).toBe('');
  });
});

describe('stableStringify', () => {
  it('is order-insensitive for object keys', () => {
    expect(stableStringify({ b: 1, a: [2, { z: 3, y: 4 }] })).toBe(
      stableStringify({ a: [2, { y: 4, z: 3 }], b: 1 }),
    );
  });
});

describe('stripHistory', () => {
  it('removes status and updatedAt recursively', () => {
    const value = {
      skills: {
        agenda: {
          path: '.opencode/skills/agenda/SKILL.md',
          purpose: 'p',
          status: { stage: 'commit', text: 't' },
          updatedAt: '20260801',
        },
      },
    };
    expect(stripHistory(value)).toEqual({
      skills: { agenda: { path: '.opencode/skills/agenda/SKILL.md', purpose: 'p' } },
    });
  });

  it('keeps arrays and scalars intact', () => {
    expect(stripHistory(['a', { status: 'x' }])).toEqual(['a', {}]);
    expect(stripHistory('plain')).toBe('plain');
    expect(stripHistory(null)).toBeNull();
  });

  it('strips nested status inside arrays and multi-level objects', () => {
    const value = {
      a: [{ status: 'x', updatedAt: 'y', keep: 1 }],
      b: { c: { d: { status: { stage: 'commit' }, updatedAt: 'z', keep: 2 } } },
    };
    expect(stripHistory(value)).toEqual({
      a: [{ keep: 1 }],
      b: { c: { d: { keep: 2 } } },
    });
  });

  it('handles empty objects and undefined', () => {
    expect(stripHistory({})).toEqual({});
    expect(stripHistory(undefined)).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const value = { a: { status: 'x', updatedAt: 'y', keep: 1 } };
    stripHistory(value);
    expect(value).toEqual({ a: { status: 'x', updatedAt: 'y', keep: 1 } });
  });
});

describe('writeCheckpoint', () => {
  it('writes a baseline checkpoint with asOf null', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-test-'));
    const prev = process.env.EVENTS_DIR;
    process.env.EVENTS_DIR = root;
    try {
      // モジュールキャッシュを破棄して EVENTS_DIR を再評価した lib を読み込む
      vi.resetModules();
      const lib = await import('./lib.mjs');
      lib.writeCheckpoint({ product: { stack: {} }, meta: {} });
      const checkpoint = JSON.parse(fs.readFileSync(path.join(root, 'checkpoint.json'), 'utf8'));
      expect(checkpoint.asOf).toBeNull();
      expect(checkpoint.compactedAt).toMatch(/\+09:00$/);
      expect(checkpoint.trees).toEqual({ product: { stack: {} }, meta: {} });
    } finally {
      if (prev === undefined) delete process.env.EVENTS_DIR;
      else process.env.EVENTS_DIR = prev;
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it('ignores log namespace events when stamping', () => {
    const trees = { product: { name: { value: 'X', status: { text: '確定' } } }, meta: {} };
    injectUpdatedAt(trees, [
      { type: 'set', key: 'log.try.a', value: {}, ts: '2026-08-26T10:00:00+09:00' },
    ]);
    expect(trees.product.name.updatedAt).toBeUndefined();
  });
});

describe('findUnresolved', () => {
  it('finds work units whose status stage is ready or implement', () => {
    const trees = {
      product: {
        features: {
          auth: { trigger: 't', status: { stage: 'ready', text: '実装待ち' } },
          done: { trigger: 't', status: { stage: 'commit', text: '完了' } },
        },
      },
      meta: {
        skills: {
          refactor: { purpose: 'p', path: 'x', status: { stage: 'implement', text: '作業中' } },
          planned: { purpose: 'p', status: { stage: 'planned', text: '未着手' } },
        },
      },
    };
    const found = findUnresolved(trees);
    expect(found).toEqual([
      { name: 'product.features.auth', stage: 'ready', text: '実装待ち', path: '' },
      { name: 'meta.skills.refactor', stage: 'implement', text: '作業中', path: 'x' },
    ]);
  });

  it('returns an empty array when nothing is unresolved', () => {
    const trees = {
      product: { features: { a: { trigger: 't', status: { stage: 'commit', text: '完了' } } } },
      meta: { skills: { b: { purpose: 'p', status: { stage: 'planned', text: '未着手' } } } },
    };
    expect(findUnresolved(trees)).toEqual([]);
  });

  it('ignores nodes without status and raw values', () => {
    const trees = {
      product: { name: { value: 'X' }, features: {} },
      meta: { harness: { x: { purpose: 'p' } } },
    };
    expect(findUnresolved(trees)).toEqual([]);
  });
});
