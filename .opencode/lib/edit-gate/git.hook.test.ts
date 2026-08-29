// git 境界ヘルパのテスト
import { describe, expect, it, vi } from 'vitest';
import { isGitClean, isGitRepo } from './git.hook';

type ShellResult = { exitCode: number; stdout: string | Buffer; stderr: string };
type GitCtx = Parameters<typeof isGitRepo>[0];

const buildCtx = (results: Record<string, ShellResult>, root: string): GitCtx => {
  const handler = vi.fn<GitCtx['$']>();
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
    return stub as unknown as ReturnType<GitCtx['$']>; // oxlint-disable-line typescript/no-unsafe-type-assertion
  });
  return { $: handler, root };
};

describe('isGitRepo', () => {
  it('returns true inside a repo with HEAD', async () => {
    const ctx = buildCtx(
      {
        'git rev-parse --is-inside-work-tree': { exitCode: 0, stdout: 'true', stderr: '' },
        'git rev-parse --verify HEAD': { exitCode: 0, stdout: 'abc123', stderr: '' },
      },
      '/root',
    );
    expect(await isGitRepo(ctx)).toBe(true);
  });

  it('returns false outside a repo', async () => {
    const ctx = buildCtx(
      {
        'git rev-parse --is-inside-work-tree': { exitCode: 128, stdout: '', stderr: 'fatal' },
      },
      '/root',
    );
    expect(await isGitRepo(ctx)).toBe(false);
  });

  it('returns false in a repo without commits', async () => {
    const ctx = buildCtx(
      {
        'git rev-parse --is-inside-work-tree': { exitCode: 0, stdout: 'true', stderr: '' },
        'git rev-parse --verify HEAD': { exitCode: 128, stdout: '', stderr: 'fatal' },
      },
      '/root',
    );
    expect(await isGitRepo(ctx)).toBe(false);
  });
});

describe('isGitClean', () => {
  it('returns true on a clean worktree', async () => {
    const ctx = buildCtx(
      { 'git status --porcelain': { exitCode: 0, stdout: '', stderr: '' } },
      '/root',
    );
    expect(await isGitClean(ctx)).toBe(true);
  });

  it('returns true on whitespace-only output', async () => {
    const ctx = buildCtx(
      { 'git status --porcelain': { exitCode: 0, stdout: '  \n\t', stderr: '' } },
      '/root',
    );
    expect(await isGitClean(ctx)).toBe(true);
  });

  it('handles Buffer stdout', async () => {
    const ctx = buildCtx(
      { 'git status --porcelain': { exitCode: 0, stdout: Buffer.from(''), stderr: '' } },
      '/root',
    );
    expect(await isGitClean(ctx)).toBe(true);
  });

  it('returns false on a dirty worktree', async () => {
    const ctx = buildCtx(
      {
        'git status --porcelain': { exitCode: 0, stdout: ' M file.ts\n', stderr: '' },
      },
      '/root',
    );
    expect(await isGitClean(ctx)).toBe(false);
  });

  it('returns false when git fails', async () => {
    const ctx = buildCtx(
      {
        'git status --porcelain': { exitCode: 128, stdout: '', stderr: 'fatal' },
      },
      '/root',
    );
    expect(await isGitClean(ctx)).toBe(false);
  });
});
