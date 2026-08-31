// unresolved.hook.ts のフック配線のテスト。git commit 検知・1回発火→スルー・コミットで復活を検証する
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShellMock } from '../utils/shell-mock';
import { resetFollowupForTests, runUnresolvedFollowup, settleFollowup } from './unresolved.hook';

const UNRESOLVED_OUTPUT = '未確定のコンポーネントがあります:\n- meta.skills.x [ready] text';

describe('runUnresolvedFollowup', () => {
  beforeEach(() => {
    resetFollowupForTests();
    vi.clearAllMocks();
  });

  it('fires a follow-up message on git commit when unresolved exist', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
      },
      '/root-a',
    );
    const report = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      { tool: 'bash', command: 'git commit -m "x"' },
    );
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('[unresolved]');
  });

  it('does not fire on non-commit commands', async () => {
    const mock = createShellMock({}, '/root-a');
    const report = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      { tool: 'bash', command: 'git status' },
    );
    expect(report.errors).toEqual([]);
  });

  it('does not fire when nothing is unresolved', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: 'There are no unresolved components',
          stderr: '',
        },
      },
      '/root-a',
    );
    const report = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      { tool: 'bash', command: 'git commit -m "x"' },
    );
    expect(report.errors).toEqual([]);
  });

  it('does not consume the fire slot when nothing is unresolved (can fire on a later commit)', async () => {
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const none = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: 'There are no unresolved components',
          stderr: '',
        },
      },
      '/root-a',
    );
    const first = await runUnresolvedFollowup(
      none.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    expect(first.errors).toEqual([]);

    const later = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
      },
      '/root-a',
    );
    const second = await runUnresolvedFollowup(
      later.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    expect(second.errors.length).toBe(1);
  });

  it('reports an error when read.mjs fails', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 1,
          stdout: '',
          stderr: 'boom',
        },
      },
      '/root-a',
    );
    const report = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      { tool: 'bash', command: 'git commit -m "x"' },
    );
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]).toContain('boom');
  });

  it('does not consume the fire slot when read.mjs fails (can fire on a later commit)', async () => {
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const fail = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 1,
          stdout: '',
          stderr: 'boom',
        },
      },
      '/root-a',
    );
    const first = await runUnresolvedFollowup(
      fail.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    expect(first.errors.length).toBe(1);

    const later = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
      },
      '/root-a',
    );
    const second = await runUnresolvedFollowup(
      later.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    expect(second.errors.length).toBe(1);
  });

  it('fires only once until commit settles', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
      },
      '/root-a',
    );
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const first = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    const second = await runUnresolvedFollowup(
      mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0], // oxlint-disable-line typescript/no-unsafe-type-assertion
      input,
    );
    expect(first.errors.length).toBe(1);
    expect(second.errors).toEqual([]);
  });

  it('revives after settle (commit success)', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
        'git status --porcelain': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const ctx = mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0]; // oxlint-disable-line typescript/no-unsafe-type-assertion

    await runUnresolvedFollowup(ctx, input);
    await settleFollowup(mock.ctx as unknown as Parameters<typeof settleFollowup>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    const again = await runUnresolvedFollowup(ctx, input);
    expect(again.errors.length).toBe(1);
  });

  it('does not revive when working tree is not clean', async () => {
    const mock = createShellMock(
      {
        'node events/scripts/read.mjs --name meta --unresolved': {
          exitCode: 0,
          stdout: UNRESOLVED_OUTPUT,
          stderr: '',
        },
        'git status --porcelain': { exitCode: 0, stdout: ' M file.ts\n', stderr: '' },
      },
      '/root-a',
    );
    const input = { tool: 'bash', command: 'git commit -m "x"' };
    const ctx = mock.ctx as unknown as Parameters<typeof runUnresolvedFollowup>[0]; // oxlint-disable-line typescript/no-unsafe-type-assertion

    await runUnresolvedFollowup(ctx, input);
    await settleFollowup(mock.ctx as unknown as Parameters<typeof settleFollowup>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    const again = await runUnresolvedFollowup(ctx, input);
    expect(again.errors).toEqual([]);
  });
});
