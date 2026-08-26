// sync.hook.ts の TTL ガード挙動テスト
// - root ごとに抑止状態が分離される
// - build / compact 失敗のみが TTL を発火する（audit 由来は発火しない）
// - TTL 経過後は再実行する
// - 成功するとその root の失敗記録は消える
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_FAILURE_TTL_MS, syncEvents, syncFailureStates } from './sync.hook';

type ShellResult = { exitCode: number; stdout: string; stderr: string };
type BuildCtxResult = {
  ctx: Parameters<typeof syncEvents>[0];
  handler: ReturnType<typeof vi.fn>;
};

const buildCtx = (results: Record<string, ShellResult>, root: string): BuildCtxResult => {
  const handler = vi.fn<Parameters<typeof syncEvents>[0]['$']>();
  handler.mockImplementation((strings, ...values) => {
    const cmd = strings.reduce(
      (acc, s, i) =>
        acc + s + (i < values.length ? (values[i] as { toString(): string }).toString() : ''),
      '',
    );
    const result: ShellResult = results[cmd] ?? { exitCode: 0, stdout: '', stderr: '' };
    const stub = {
      cwd: (cwdDir: string) => {
        if (cwdDir !== root) throw new Error(`unexpected cwd: ${cwdDir}`);
        return {
          nothrow: () => ({
            quiet: () => Promise.resolve(result),
          }),
        };
      },
    };
    // BunShellPromise は stdin/env/quiet/lines 等 10+ メソッドを持つため、
    // テストで完全モックするのは非現実的。unknown 段で widening して逃げる
    return stub as unknown as ReturnType<Parameters<typeof syncEvents>[0]['$']>; // oxlint-disable-line typescript/no-unsafe-type-assertion
  });
  const ctx: Parameters<typeof syncEvents>[0] = { $: handler, root };
  return { ctx, handler };
};

describe('syncEvents TTL guard', () => {
  beforeEach(() => {
    syncFailureStates.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
  });

  afterEach(() => {
    syncFailureStates.clear();
    vi.useRealTimers();
  });

  it('runs events commands on a fresh call and records success', async () => {
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(syncFailureStates.has('/root-a')).toBe(false);
  });

  it('skips events commands when the same root failed within TTL', async () => {
    syncFailureStates.set('/root-a', Date.now());
    const { ctx, handler } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs events commands again after TTL elapses', async () => {
    syncFailureStates.set('/root-a', Date.now() - (SYNC_FAILURE_TTL_MS + 1));
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(syncFailureStates.has('/root-a')).toBe(false);
  });

  it("does not let one root's failure block another root", async () => {
    syncFailureStates.set('/root-a', Date.now());
    const { ctx, handler } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-b',
    );
    const report = await syncEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(handler).toHaveBeenCalled();
  });

  it('does not set TTL on audit-only findings', async () => {
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': {
          exitCode: 0,
          stdout: JSON.stringify({
            skills: {
              bogus: { purpose: 'x', status: { stage: 'ready' } },
            },
          }),
          stderr: '',
        },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[audit]'))).toBe(true);
    expect(syncFailureStates.has('/root-a')).toBe(false);
  });

  it('sets TTL on build failure', async () => {
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 1, stdout: '', stderr: 'boom' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[events] build'))).toBe(true);
    expect(syncFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('sets TTL on compact failure when line count crosses the threshold', async () => {
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 1, stdout: '', stderr: 'compact-boom' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[events] compact'))).toBe(true);
    expect(syncFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('clears the TTL entry on a subsequent success', async () => {
    syncFailureStates.set('/root-a', Date.now());
    vi.setSystemTime(new Date(Date.now() + SYNC_FAILURE_TTL_MS + 1));
    const { ctx } = buildCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '0', stderr: '' },
        'node events/scripts/build.mjs': { exitCode: 0, stdout: '', stderr: '' },
        'node events/scripts/read.mjs --name meta': { exitCode: 0, stdout: 'null', stderr: '' },
      },
      '/root-a',
    );
    const report = await syncEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(syncFailureStates.has('/root-a')).toBe(false);
  });
});
