// buildTrailEvent の構築規則のテスト。対象ツール・パス抽出・root相対化・検証を検証する
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildTrailEvent, type TrailEvent, type TrailInput } from './trail';

const root = '/home/x/pj';

// null を throw に変換して型を絞るヘルパ（non-null assertion を避ける）
const build = (input: TrailInput): TrailEvent => {
  const event = buildTrailEvent(input);
  if (event === null) throw new Error('expected an event');
  return event;
};

describe('buildTrailEvent', () => {
  it('builds a file tool event with a root-relative path', () => {
    const event = build({
      tool: 'edit',
      args: { filePath: '/home/x/pj/src/a.ts' },
      gap: 12000,
      root,
    });
    expect(event.type).toBe('set');
    expect(event.key).toMatch(/^log\.try\.[0-9a-f]{8}$/);
    expect(event.value).toEqual({ tool: 'edit', gap: 12000, path: 'src/a.ts' });
    expect(typeof event.ts).toBe('string');
  });

  it('matches tool names case-insensitively and the file arg variant', () => {
    const event = build({ tool: 'Read', args: { file: '/home/x/pj/b.ts' }, gap: 0, root });
    expect(event.value).toEqual({ tool: 'read', gap: 0, path: 'b.ts' });
  });

  it('extracts the path from the path arg variant', () => {
    const event = build({ tool: 'read', args: { path: '/home/x/pj/c.ts' }, gap: 0, root });
    expect(event.value).toEqual({ tool: 'read', gap: 0, path: 'c.ts' });
  });

  it('expands tilde paths against the home directory', () => {
    const event = build({ tool: 'read', args: { filePath: '~/x.ts' }, gap: 0, root: homedir() });
    expect(event.value).toEqual({ tool: 'read', gap: 0, path: 'x.ts' });
  });

  it('builds a skill event with the skill name', () => {
    const event = build({ tool: 'skill', args: { name: 'agenda' }, gap: 500, root });
    expect(event.value).toEqual({ tool: 'skill', gap: 500, name: 'agenda' });
  });

  it('returns null for tools outside the whitelist', () => {
    for (const tool of ['bash', 'grep', 'task', 'question', 'webfetch'])
      expect(buildTrailEvent({ tool, args: {}, gap: 0, root })).toBeNull();
  });

  it('returns null for a negative or non-integer gap', () => {
    expect(
      buildTrailEvent({ tool: 'read', args: { filePath: '/home/x/pj/a.ts' }, gap: -1, root }),
    ).toBeNull();
    expect(
      buildTrailEvent({ tool: 'read', args: { filePath: '/home/x/pj/a.ts' }, gap: 1.5, root }),
    ).toBeNull();
    expect(
      buildTrailEvent({
        tool: 'read',
        args: { filePath: '/home/x/pj/a.ts' },
        gap: Number.NaN,
        root,
      }),
    ).toBeNull();
    expect(
      buildTrailEvent({
        tool: 'read',
        args: { filePath: '/home/x/pj/a.ts' },
        gap: Number.POSITIVE_INFINITY,
        root,
      }),
    ).toBeNull();
  });

  it('returns null when the path is missing or empty', () => {
    expect(buildTrailEvent({ tool: 'edit', args: {}, gap: 0, root })).toBeNull();
    expect(buildTrailEvent({ tool: 'edit', args: { filePath: '' }, gap: 0, root })).toBeNull();
  });

  it('returns null for paths outside the root', () => {
    expect(
      buildTrailEvent({ tool: 'read', args: { filePath: '/outside/a.ts' }, gap: 0, root }),
    ).toBeNull();
  });

  it('returns null for a missing or empty skill name', () => {
    expect(buildTrailEvent({ tool: 'skill', args: {}, gap: 0, root })).toBeNull();
    expect(buildTrailEvent({ tool: 'skill', args: { name: '' }, gap: 0, root })).toBeNull();
  });
});
