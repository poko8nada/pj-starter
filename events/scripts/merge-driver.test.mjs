// merge-driver のテスト。デルタ抽出・末尾アペンドの純関数と CLI 境界を検証する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchDelta, currentBranch, mergeLines, splitLines } from './merge-driver.mjs';

const SCRIPT = path.resolve('events/scripts/merge-driver.mjs');

const line = (key, branch, type = 'set') =>
  JSON.stringify({ ts: '2026-09-03T00:00:00.000+09:00', type, key, value: 'v', branch });

describe('currentBranch', () => {
  it('prefers EVENTS_BRANCH over git', () => {
    const previous = process.env.EVENTS_BRANCH;
    process.env.EVENTS_BRANCH = 'feature/foo';
    try {
      expect(currentBranch()).toBe('feature/foo');
    } finally {
      if (previous === undefined) delete process.env.EVENTS_BRANCH;
      else process.env.EVENTS_BRANCH = previous;
    }
  });

  it('returns empty when git is unavailable', () => {
    const previousBranch = process.env.EVENTS_BRANCH;
    const previousGitDir = process.env.GIT_DIR;
    delete process.env.EVENTS_BRANCH;
    process.env.GIT_DIR = '/nonexistent';
    try {
      expect(currentBranch()).toBe('');
    } finally {
      if (previousBranch !== undefined) process.env.EVENTS_BRANCH = previousBranch;
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
    }
  });
});

describe('branchDelta', () => {
  it('extracts only lines whose branch matches the current branch', () => {
    const lines = [line('a', 'feature/foo'), line('b', 'develop'), line('c', 'feature/foo')];
    expect(branchDelta(lines, 'feature/foo')).toEqual([lines[0], lines[2]]);
  });

  it('returns empty when no lines match', () => {
    expect(branchDelta([line('a', 'develop')], 'feature/foo')).toEqual([]);
  });

  it('skips unparseable lines', () => {
    expect(branchDelta(['not-json', line('a', 'feature/foo')], 'feature/foo')).toEqual([
      line('a', 'feature/foo'),
    ]);
  });
});

describe('mergeLines', () => {
  it('appends the current branch delta after the theirs block', () => {
    const ours = [line('shared', 'develop'), line('mine', 'feature/foo')];
    const theirs = [line('shared', 'develop'), line('parent', 'develop')];
    expect(mergeLines(ours, theirs, 'feature/foo')).toEqual([
      line('shared', 'develop'),
      line('parent', 'develop'),
      line('mine', 'feature/foo'),
    ]);
  });

  it('keeps the deletion when the current branch deleted a key the parent still has', () => {
    const ours = [line('X', 'feature/foo', 'del')];
    const theirs = [line('X', 'develop')];
    const merged = mergeLines(ours, theirs, 'feature/foo');
    expect(merged).toEqual([line('X', 'develop'), line('X', 'feature/foo', 'del')]);
  });

  it('dedupes exact-duplicate lines', () => {
    const ours = [line('a', 'develop'), line('b', 'feature/foo')];
    const theirs = [line('a', 'develop')];
    expect(mergeLines(ours, theirs, 'feature/foo')).toEqual([
      line('a', 'develop'),
      line('b', 'feature/foo'),
    ]);
  });

  it('returns theirs unchanged when the current branch has no delta', () => {
    const ours = [line('a', 'develop')];
    const theirs = [line('a', 'develop'), line('b', 'develop')];
    expect(mergeLines(ours, theirs, 'feature/foo')).toEqual([
      line('a', 'develop'),
      line('b', 'develop'),
    ]);
  });

  it('handles empty sides', () => {
    expect(mergeLines([], [line('a', 'develop')], 'feature/foo')).toEqual([line('a', 'develop')]);
    expect(mergeLines([line('a', 'feature/foo')], [], 'feature/foo')).toEqual([
      line('a', 'feature/foo'),
    ]);
    expect(mergeLines([], [], 'feature/foo')).toEqual([]);
  });
});

describe('splitLines', () => {
  it('drops blank lines including the trailing-newline artifact', () => {
    expect(splitLines('a\n\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
  });
});

describe('CLI boundary', () => {
  it('writes the merged result to the ours file and exits 0', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-driver-test-'));
    const ancestor = path.join(root, 'O');
    const ours = path.join(root, 'A');
    const theirs = path.join(root, 'B');
    fs.writeFileSync(ancestor, '');
    fs.writeFileSync(ours, `${line('mine', 'feature/foo')}\n`);
    fs.writeFileSync(theirs, `${line('parent', 'develop')}\n`);
    const result = spawnSync(process.execPath, [SCRIPT, ancestor, ours, theirs], {
      env: { ...process.env, EVENTS_BRANCH: 'feature/foo' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const written = fs.readFileSync(ours, 'utf8');
    expect(written).toBe(`${line('parent', 'develop')}\n${line('mine', 'feature/foo')}\n`);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exits non-zero when a file is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-driver-test-'));
    const result = spawnSync(
      process.execPath,
      [SCRIPT, path.join(root, 'O'), path.join(root, 'A'), path.join(root, 'B')],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
