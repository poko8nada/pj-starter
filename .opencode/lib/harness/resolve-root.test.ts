// resolveProjectRoot の優先順位・空入力・全候補不在フォールバックを網羅
import type * as Fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const eventsPaths = vi.hoisted(() => new Set<string>());

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof Fs>('node:fs');
  return {
    ...actual,
    existsSync: (path: string) => {
      // join("/has-events", "events") = "/has-events/events"
      return eventsPaths.has(path);
    },
  };
});

const { resolveProjectRoot } = await import('./resolve-root');

afterEach(() => {
  eventsPaths.clear();
  vi.restoreAllMocks();
});

describe('resolveProjectRoot', () => {
  it('prefers worktree when it contains events/', () => {
    eventsPaths.add('/has-events/events');
    expect(resolveProjectRoot({ worktree: '/has-events', directory: '/other' })).toBe(
      '/has-events',
    );
  });

  it('prefers worktree when both worktree and directory contain events/', () => {
    eventsPaths.add('/has-events/events');
    eventsPaths.add('/other/events');
    expect(resolveProjectRoot({ worktree: '/has-events', directory: '/other' })).toBe(
      '/has-events',
    );
  });

  it('falls back to directory when worktree has no events/', () => {
    eventsPaths.add('/has-events/events');
    expect(resolveProjectRoot({ worktree: '/no-events', directory: '/has-events' })).toBe(
      '/has-events',
    );
  });

  it('falls back to cwd when neither worktree nor directory has events/', () => {
    eventsPaths.add('/has-events/events');
    expect(
      resolveProjectRoot({ worktree: '/no-events', directory: '/no-events' }, '/has-events'),
    ).toBe('/has-events');
  });

  it('returns cwd as last resort when no candidate has events/', () => {
    expect(
      resolveProjectRoot({ worktree: '/no-events', directory: '/no-events' }, '/no-events'),
    ).toBe('/no-events');
  });

  it('skips empty worktree and falls back to directory', () => {
    eventsPaths.add('/has-events/events');
    expect(resolveProjectRoot({ worktree: '', directory: '/has-events' }, '/no-events')).toBe(
      '/has-events',
    );
  });

  it('skips missing worktree input and falls back to directory', () => {
    eventsPaths.add('/has-events/events');
    expect(resolveProjectRoot({ directory: '/has-events' }, '/no-events')).toBe('/has-events');
  });

  it('skips non-string worktree/directory inputs and falls back to cwd', () => {
    eventsPaths.add('/has-events/events');
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/has-events');
    expect(resolveProjectRoot({ worktree: 123, directory: null })).toBe('/has-events');
    spy.mockRestore();
  });

  it('uses process.cwd() when cwd argument is omitted and cwd has events/', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/has-events');
    eventsPaths.add('/has-events/events');
    expect(resolveProjectRoot({})).toBe('/has-events');
    spy.mockRestore();
  });

  it('returns process.cwd() unchanged when nothing matches', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/no-events');
    expect(resolveProjectRoot({})).toBe('/no-events');
    spy.mockRestore();
  });
});
