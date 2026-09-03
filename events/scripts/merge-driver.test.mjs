// merge-driver のテスト。純粋結合の正常系・異常系と CLI 境界を検証する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeLines, splitLines } from './merge-driver.mjs';

const SCRIPT = path.resolve('events/scripts/merge-driver.mjs');

describe('mergeLines', () => {
  it('appends ours-unique lines after theirs block', () => {
    expect(mergeLines(['b1', 'f2'], ['b1', 'f1'])).toEqual(['b1', 'f1', 'f2']);
  });

  it('keeps theirs order when ours adds nothing new', () => {
    expect(mergeLines(['b1', 'f1'], ['b1', 'f1', 'f2'])).toEqual(['b1', 'f1', 'f2']);
  });

  it('returns identical sides unchanged', () => {
    expect(mergeLines(['b1'], ['b1'])).toEqual(['b1']);
  });

  it('handles empty sides', () => {
    expect(mergeLines([], ['x'])).toEqual(['x']);
    expect(mergeLines(['x'], [])).toEqual(['x']);
    expect(mergeLines([], [])).toEqual([]);
  });

  it('dedupes exact-duplicate lines', () => {
    expect(mergeLines(['a', 'b', 'a'], ['a', 'c'])).toEqual(['a', 'c', 'b']);
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
    fs.writeFileSync(ancestor, 'b1\n');
    fs.writeFileSync(ours, 'b1\nf2\n');
    fs.writeFileSync(theirs, 'b1\nf1\n');
    const result = spawnSync(process.execPath, [SCRIPT, ancestor, ours, theirs], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(fs.readFileSync(ours, 'utf8')).toBe('b1\nf1\nf2\n');
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
