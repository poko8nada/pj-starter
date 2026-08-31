// unresolved.hook.ts のフック配線のテスト。git commit 検知・1回発火→スルー・コミットで復活を検証する
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShellMock } from '../utils/shell-mock';
import { resetFollowupForTests, runUnresolvedFollowup, settleFollowup } from './unresolved.hook';
import type { UnresolvedCtx } from './unresolved.hook';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

// 実在する一時ディレクトリにスナップショットを書き、root を指す ctx を返す。
// files は { 'meta': content | null, 'product': content | null }。null のものは書かない。
const makeCtx = (
  files: Record<'meta' | 'product', Record<string, unknown> | null>,
  gitClean: boolean = true,
): UnresolvedCtx => {
  const root = mkdtempSync(join(tmpdir(), 'unresolved-test-'));
  roots.push(root);
  const dir = join(root, 'events', 'snapshots');
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ content }));
  }
  const shell = createShellMock(
    {
      'git status --porcelain': { exitCode: 0, stdout: gitClean ? '' : ' M file.ts\n', stderr: '' },
    },
    root,
  );
  return { $: shell.ctx.$, root } as unknown as UnresolvedCtx; // oxlint-disable-line typescript/no-unsafe-type-assertion
};

const UNRESOLVED_META = {
  skills: { x: { purpose: 'p', path: 'x', status: { stage: 'ready', text: 'text' } } },
};

const UNRESOLVED_PRODUCT = {
  features: { y: { trigger: 't', result: 'r', status: { stage: 'implement', text: 'text2' } } },
};

describe('runUnresolvedFollowup', () => {
  beforeEach(() => {
    resetFollowupForTests();
    vi.clearAllMocks();
  });

  it('fires a follow-up message on git commit when unresolved exist', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: null });
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git commit -m "x"' });
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('[unresolved]');
  });

  it('does not fire on non-commit commands', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: null });
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git status' });
    expect(report.errors).toEqual([]);
  });

  it('does not fire when nothing is unresolved', async () => {
    const ctx = makeCtx({
      meta: { skills: { x: { purpose: 'p', status: { stage: 'commit', text: 'done' } } } },
      product: null,
    });
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git commit -m "x"' });
    expect(report.errors).toEqual([]);
  });

  it('does not fire when snapshots are missing', async () => {
    const ctx = makeCtx({ meta: null, product: null });
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git commit -m "x"' });
    expect(report.errors).toEqual([]);
  });

  it('aggregates unresolved from both namespaces (meta and product)', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: UNRESOLVED_PRODUCT });
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git commit -m "x"' });
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('meta.skills.x');
    expect(report.errors[0]).toContain('product.features.y');
  });

  it('skips an unreadable snapshot and still reports the readable one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'unresolved-test-'));
    roots.push(root);
    const dir = join(root, 'events', 'snapshots');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ content: UNRESOLVED_META }));
    writeFileSync(join(dir, 'product.json'), '{ invalid json');
    const shell = createShellMock(
      { 'git status --porcelain': { exitCode: 0, stdout: '', stderr: '' } },
      root,
    );
    const ctx = { $: shell.ctx.$, root } as unknown as UnresolvedCtx; // oxlint-disable-line typescript/no-unsafe-type-assertion
    const report = await runUnresolvedFollowup(ctx, { tool: 'bash', command: 'git commit -m "x"' });
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('meta.skills.x');
  });

  it('does not consume the fire slot when nothing is unresolved (can fire on a later commit)', async () => {
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const noneCtx = makeCtx({
      meta: { skills: { x: { purpose: 'p', status: { stage: 'commit' } } } },
      product: null,
    });
    const first = await runUnresolvedFollowup(noneCtx, input);
    expect(first.errors).toEqual([]);

    const laterCtx = makeCtx({ meta: UNRESOLVED_META, product: null });
    const second = await runUnresolvedFollowup(laterCtx, input);
    expect(second.errors.length).toBe(1);
  });

  it('fires only once until commit settles', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: null });
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const first = await runUnresolvedFollowup(ctx, input);
    const second = await runUnresolvedFollowup(ctx, input);
    expect(first.errors.length).toBe(1);
    expect(second.errors).toEqual([]);
  });

  it('revives after settle (commit success)', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: null });
    const input = { tool: 'bash', command: 'git commit -m "x"' };

    await runUnresolvedFollowup(ctx, input);
    await settleFollowup(ctx);
    const again = await runUnresolvedFollowup(ctx, input);
    expect(again.errors.length).toBe(1);
  });

  it('does not revive when working tree is not clean', async () => {
    const ctx = makeCtx({ meta: UNRESOLVED_META, product: null }, false);
    const input = { tool: 'bash', command: 'git commit -m "x"' };

    await runUnresolvedFollowup(ctx, input);
    await settleFollowup(ctx);
    const again = await runUnresolvedFollowup(ctx, input);
    expect(again.errors).toEqual([]);
  });
});
