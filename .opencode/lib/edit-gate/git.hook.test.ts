// git 境界ヘルパのテスト
import { describe, expect, it } from 'vitest';
import { isGitClean, isGitRepo } from './git.hook';
import { createShellMock, type ShellResult } from '../utils/shell-mock';

type GitCtx = Parameters<typeof isGitRepo>[0];

const buildCtx = (results: Record<string, ShellResult>, root: string): GitCtx => {
  const { ctx } = createShellMock(results, root);
  return ctx as GitCtx; // oxlint-disable-line typescript/no-unsafe-type-assertion
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
