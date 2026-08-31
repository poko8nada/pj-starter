// events/scripts/read.mjs の CLI 出力（--name と --unresolved）に関するテスト
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root;
let prevEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-test-'));
  prevEnv = process.env.EVENTS_DIR;
  process.env.EVENTS_DIR = root;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.EVENTS_DIR;
  else process.env.EVENTS_DIR = prevEnv;
  fs.rmSync(root, { recursive: true, force: true });
});

const runRead = (args) => {
  const result = spawnSync('node', ['events/scripts/read.mjs', ...args], {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..'),
    env: { ...process.env, EVENTS_DIR: root },
    encoding: 'utf8',
  });
  return { stdout: result.stdout.trim(), status: result.status };
};

const writeSnapshot = (name, content) => {
  const dir = path.join(root, 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ content }));
};

describe('read.mjs --unresolved', () => {
  it('lists unresolved work units in human-readable form', () => {
    writeSnapshot('meta', {
      skills: {
        refactor: { purpose: 'p', path: 'x', status: { stage: 'ready', text: '実装待ち' } },
        planned: { purpose: 'p', status: { stage: 'planned', text: '未着手' } },
      },
    });
    const { stdout, status } = runRead(['--name', 'meta', '--unresolved']);
    expect(status).toBe(0);
    expect(stdout).toContain('未確定のコンポーネントがあります');
    expect(stdout).toContain('meta.skills.refactor');
    expect(stdout).toContain('[ready]');
    expect(stdout).not.toContain('meta.skills.planned');
  });

  it('reports none when nothing is unresolved', () => {
    writeSnapshot('meta', {
      skills: { x: { purpose: 'p', status: { stage: 'commit', text: '完了' } } },
    });
    const { stdout } = runRead(['--name', 'meta', '--unresolved']);
    expect(stdout).toBe('未確定のコンポーネントはありません');
  });

  it('reports none when snapshot is missing', () => {
    const { stdout } = runRead(['--name', 'meta', '--unresolved']);
    expect(stdout).toBe('未確定のコンポーネントはありません');
  });
});

describe('read.mjs --name (legacy behavior)', () => {
  it('outputs content as JSON', () => {
    writeSnapshot('product', { name: { value: 'X' } });
    const { stdout } = runRead(['--name', 'product']);
    expect(JSON.parse(stdout)).toEqual({ name: { value: 'X' } });
  });
});
