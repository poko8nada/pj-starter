// compact.hook.ts の TTL ガード挙動テスト
// - root ごとに抑止状態が分離される
// - compact 失敗・行数取得失敗が TTL を発火する
// - TTL 経過後は再実行する
// - 成功するとその root の失敗記録は消える
// - 閾値未満なら compact を実行しない
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_FAILURE_TTL_MS, compactEvents, compactFailureStates } from './compact.hook';
import { createShellMock, type ShellResult } from '../utils/shell-mock';

type CompactCtxResult = {
  ctx: Parameters<typeof compactEvents>[0];
  handler: ReturnType<typeof vi.fn>;
};

const compactCtx = (results: Record<string, ShellResult>, root: string): CompactCtxResult => {
  const { ctx, handler } = createShellMock(results, root);
  return { ctx: ctx as Parameters<typeof compactEvents>[0], handler }; // oxlint-disable-line typescript/no-unsafe-type-assertion
};

const compactCalled = (handler: ReturnType<typeof vi.fn>): boolean =>
  handler.mock.calls.some((call) => call[0][0] === 'node events/scripts/compact.mjs');

describe('compactEvents TTL guard', () => {
  beforeEach(() => {
    compactFailureStates.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
  });

  afterEach(() => {
    compactFailureStates.clear();
    vi.useRealTimers();
  });

  it('runs compact when the line count crosses the threshold', async () => {
    const { ctx, handler } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it('does not run compact below the threshold', async () => {
    const { ctx, handler } = compactCtx(
      { 'wc -l events/log.jsonl': { exitCode: 0, stdout: '10', stderr: '' } },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(false);
  });

  it('clears a stale TTL entry when the line count is below the threshold', async () => {
    compactFailureStates.set('/root-a', Date.now() - (COMPACT_FAILURE_TTL_MS + 1));
    const { ctx, handler } = compactCtx(
      { 'wc -l events/log.jsonl': { exitCode: 0, stdout: '10', stderr: '' } },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(false);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it('runs compact at the threshold boundary (999 vs 1000)', async () => {
    const below = compactCtx(
      { 'wc -l events/log.jsonl': { exitCode: 0, stdout: '999', stderr: '' } },
      '/root-a',
    );
    await compactEvents(below.ctx);
    expect(compactCalled(below.handler)).toBe(false);

    const at = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-b',
    );
    await compactEvents(at.ctx);
    expect(compactCalled(at.handler)).toBe(true);
  });

  it('sets TTL when the line count output is invalid', async () => {
    const { ctx, handler } = compactCtx(
      { 'wc -l events/log.jsonl': { exitCode: 0, stdout: 'not-a-number', stderr: '' } },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[events] line count'))).toBe(true);
    expect(compactCalled(handler)).toBe(false);
    expect(compactFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('sets TTL when the line count command fails', async () => {
    const { ctx, handler } = compactCtx(
      { 'wc -l events/log.jsonl': { exitCode: 1, stdout: '', stderr: 'wc-boom' } },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[events] line count'))).toBe(true);
    expect(compactCalled(handler)).toBe(false);
    expect(compactFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('skips compact when the same root failed within TTL', async () => {
    compactFailureStates.set('/root-a', Date.now());
    const { ctx, handler } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(false);
  });

  it('runs compact again after TTL elapses', async () => {
    compactFailureStates.set('/root-a', Date.now() - (COMPACT_FAILURE_TTL_MS + 1));
    const { ctx, handler } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it("does not let one root's failure block another root", async () => {
    compactFailureStates.set('/root-a', Date.now());
    const { ctx, handler } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-b',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
  });

  it('sets TTL on compact failure', async () => {
    const { ctx } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 1, stdout: '', stderr: 'compact-boom' },
      },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors.some((e) => e.startsWith('[events] compact'))).toBe(true);
    expect(compactFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('clears the TTL entry on a subsequent success', async () => {
    compactFailureStates.set('/root-a', Date.now());
    vi.setSystemTime(new Date(Date.now() + COMPACT_FAILURE_TTL_MS + 1));
    const { ctx, handler } = compactCtx(
      {
        'wc -l events/log.jsonl': { exitCode: 0, stdout: '1000', stderr: '' },
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    const report = await compactEvents(ctx);
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });
});
