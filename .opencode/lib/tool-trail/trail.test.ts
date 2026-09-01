// buildTrailEvent, mergeTrailEvents, isCommitCommand のテスト。対象抽出・root相対化・マージ判定・commit検知を検証する
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildTrailEvent,
  isAppendCommand,
  isClosingAppend,
  isCommitCommand,
  mergeTrailEvents,
  type TrailEvent,
  type TrailInput,
} from './trail';

const root = '/home/x/pj';

// null を throw に変換して型を絞るヘルパ（non-null assertion を避ける）
const build = (input: TrailInput): TrailEvent => {
  const event = buildTrailEvent(input);
  if (event === null) throw new Error('expected an event');
  return event;
};

const merge = (last: TrailEvent, next: TrailEvent): TrailEvent => {
  const merged = mergeTrailEvents(last, next);
  if (merged === null) throw new Error('expected a merge');
  return merged;
};

// mergeTrailEvents のテスト用イベント
const makeEvent = (tool: string, gap: number, targets: string[], ts?: string): TrailEvent => ({
  ts: ts ?? '2026-08-30T10:00:00.000+09:00',
  type: 'set',
  key: 'log.try.abc12345',
  value: { tool, gap, targets },
});

describe('buildTrailEvent', () => {
  it('builds a file tool event with a root-relative target', () => {
    const event = build({
      tool: 'edit',
      args: { filePath: '/home/x/pj/src/a.ts' },
      gap: 12000,
      root,
    });
    expect(event.type).toBe('set');
    expect(event.key).toMatch(/^log\.try\.[0-9a-f]{8}$/);
    expect(event.value).toEqual({ tool: 'edit', gap: 12000, targets: ['src/a.ts'] });
    expect(typeof event.ts).toBe('string');
  });

  it('extracts the target per tool', () => {
    expect(build({ tool: 'bash', args: { command: 'pnpm test' }, gap: 0, root }).value).toEqual({
      tool: 'bash',
      gap: 0,
      targets: ['pnpm'],
    });
    expect(
      build({ tool: 'bash', args: { command: 'git add -A && git commit -m "x"' }, gap: 0, root })
        .value,
    ).toEqual({
      tool: 'bash',
      gap: 0,
      targets: ['git'],
    });
    expect(build({ tool: 'websearch', args: { query: 'opencode' }, gap: 0, root }).value).toEqual({
      tool: 'websearch',
      gap: 0,
      targets: ['opencode'],
    });
    expect(build({ tool: 'webfetch', args: { url: 'https://x.dev' }, gap: 0, root }).value).toEqual(
      {
        tool: 'webfetch',
        gap: 0,
        targets: ['https://x.dev'],
      },
    );
    expect(build({ tool: 'task', args: { subagent_type: 'explore' }, gap: 0, root }).value).toEqual(
      {
        tool: 'task',
        gap: 0,
        targets: ['explore'],
      },
    );
    expect(build({ tool: 'skill', args: { name: 'agenda' }, gap: 0, root }).value).toEqual({
      tool: 'skill',
      gap: 0,
      targets: ['agenda'],
    });
  });

  it('uses the tool name as the target for mcp_* tools', () => {
    expect(build({ tool: 'mcp_github_search', args: { query: 'x' }, gap: 0, root }).value).toEqual({
      tool: 'mcp_github_search',
      gap: 0,
      targets: ['mcp_github_search'],
    });
  });

  it('matches tool names case-insensitively and the file arg variant', () => {
    const event = build({ tool: 'Read', args: { file: '/home/x/pj/b.ts' }, gap: 0, root });
    expect(event.value).toEqual({ tool: 'read', gap: 0, targets: ['b.ts'] });
  });

  it('expands tilde paths against the home directory', () => {
    const event = build({ tool: 'read', args: { filePath: '~/x.ts' }, gap: 0, root: homedir() });
    expect(event.value).toEqual({ tool: 'read', gap: 0, targets: ['x.ts'] });
  });

  it('returns null for tools outside the whitelist', () => {
    for (const tool of ['grep', 'glob', 'question', 'todowrite']) {
      expect(buildTrailEvent({ tool, args: {}, gap: 0, root })).toBeNull();
    }
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

  it('returns null when the target is missing or empty', () => {
    expect(buildTrailEvent({ tool: 'edit', args: {}, gap: 0, root })).toBeNull();
    expect(buildTrailEvent({ tool: 'bash', args: { command: '   ' }, gap: 0, root })).toBeNull();
    expect(buildTrailEvent({ tool: 'bash', args: { command: '' }, gap: 0, root })).toBeNull();
    expect(buildTrailEvent({ tool: 'skill', args: { name: '' }, gap: 0, root })).toBeNull();
  });

  it('extracts the first command token with surrounding whitespace', () => {
    expect(
      build({ tool: 'bash', args: { command: '  node  --version  ' }, gap: 0, root }).value,
    ).toEqual({
      tool: 'bash',
      gap: 0,
      targets: ['node'],
    });
    expect(build({ tool: 'bash', args: { command: '"quoted" arg' }, gap: 0, root }).value).toEqual({
      tool: 'bash',
      gap: 0,
      targets: ['"quoted"'],
    });
  });

  it('returns null for paths outside the root', () => {
    expect(
      buildTrailEvent({ tool: 'read', args: { filePath: '/outside/a.ts' }, gap: 0, root }),
    ).toBeNull();
  });
});

describe('mergeTrailEvents', () => {
  it('merges consecutive same-tool tries by extending targets', () => {
    expect(merge(makeEvent('read', 2000, ['a.ts']), makeEvent('read', 500, ['b.ts']))).toEqual({
      ts: '2026-08-30T10:00:00.000+09:00',
      type: 'set',
      key: 'log.try.abc12345',
      value: { tool: 'read', gap: 2000, targets: ['a.ts', 'b.ts'] },
    });
  });

  it('keeps the first gap and identity when merging', () => {
    const merged = merge(makeEvent('bash', 3000, ['cmd1']), makeEvent('bash', 100, ['cmd2']));
    expect(merged.value).toEqual({ tool: 'bash', gap: 3000, targets: ['cmd1', 'cmd2'] });
  });

  it('accumulates targets across repeated merges', () => {
    const first = merge(makeEvent('read', 2000, ['a.ts']), makeEvent('read', 100, ['b.ts']));
    const second = merge(first, makeEvent('read', 50, ['c.ts']));
    expect(second.value).toEqual({ tool: 'read', gap: 2000, targets: ['a.ts', 'b.ts', 'c.ts'] });
  });

  it('merges an empty targets array without error', () => {
    const merged = merge(makeEvent('read', 2000, []), makeEvent('read', 100, ['a.ts']));
    expect(merged.value).toEqual({ tool: 'read', gap: 2000, targets: ['a.ts'] });
  });

  it('returns null for different tools', () => {
    expect(
      mergeTrailEvents(makeEvent('read', 0, ['a.ts']), makeEvent('edit', 0, ['b.ts'])),
    ).toBeNull();
  });

  it('uses the next event timestamp for the merged line', () => {
    const merged = merge(
      makeEvent('read', 2000, ['a.ts'], '2026-08-30T10:00:00.000+09:00'),
      makeEvent('read', 500, ['b.ts'], '2026-08-30T10:00:05.000+09:00'),
    );
    expect(merged.ts).toBe('2026-08-30T10:00:05.000+09:00');
  });
});

describe('isCommitCommand', () => {
  it('detects git commit with message flag', () => {
    expect(isCommitCommand('git commit -m "feat: x"')).toBe(true);
  });

  it('detects git commit without arguments', () => {
    expect(isCommitCommand('git commit')).toBe(true);
  });

  it('detects git commit with leading whitespace', () => {
    expect(isCommitCommand('  git commit  ')).toBe(true);
  });

  it('rejects git status', () => {
    expect(isCommitCommand('git status')).toBe(false);
  });

  it('rejects git commit--amend (no whitespace separator)', () => {
    expect(isCommitCommand('git commit--amend')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isCommitCommand(undefined)).toBe(false);
    expect(isCommitCommand(null)).toBe(false);
    expect(isCommitCommand(123)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isCommitCommand('')).toBe(false);
  });
});

describe('isAppendCommand', () => {
  it('detects append-build with flags', () => {
    expect(
      isAppendCommand('node events/scripts/append-build.mjs --set meta.harness.x.status'),
    ).toBe(true);
  });

  it('detects append without build', () => {
    expect(isAppendCommand('node events/scripts/append.mjs --set product.name.value "x"')).toBe(
      true,
    );
  });

  it('detects append with leading whitespace', () => {
    expect(isAppendCommand('  node events/scripts/append-build.mjs  ')).toBe(true);
  });

  it('detects append with a ./ prefix', () => {
    expect(
      isAppendCommand('node ./events/scripts/append-build.mjs --set meta.harness.x.status'),
    ).toBe(true);
  });

  it('rejects non-append event scripts', () => {
    expect(isAppendCommand('node events/scripts/build.mjs')).toBe(false);
    expect(isAppendCommand('node events/scripts/read.mjs --name meta')).toBe(false);
    expect(isAppendCommand('node events/scripts/compact.mjs')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isAppendCommand(undefined)).toBe(false);
    expect(isAppendCommand(null)).toBe(false);
    expect(isAppendCommand(123)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAppendCommand('')).toBe(false);
  });
});

describe('isClosingAppend', () => {
  it('detects an append asserting stage:commit', () => {
    expect(
      isClosingAppend(
        'node events/scripts/append-build.mjs --set meta.harness.x.status \'{"stage":"commit","text":"y"}\'',
      ),
    ).toBe(true);
  });

  it('rejects an append asserting a non-commit stage', () => {
    expect(
      isClosingAppend(
        'node events/scripts/append-build.mjs --set meta.harness.x.status \'{"stage":"implement","text":"y"}\'',
      ),
    ).toBe(false);
  });

  it('rejects an append without a stage', () => {
    expect(isClosingAppend('node events/scripts/append.mjs --set product.name.value "x"')).toBe(
      false,
    );
  });

  it('rejects a non-append command even with stage:commit text', () => {
    expect(isClosingAppend('node events/scripts/build.mjs --set x \'{"stage":"commit"}\'')).toBe(
      false,
    );
  });

  it('rejects non-string input', () => {
    expect(isClosingAppend(undefined)).toBe(false);
    expect(isClosingAppend(null)).toBe(false);
  });
});
