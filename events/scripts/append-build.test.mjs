// append-build ラッパーのテスト。append 成功時のみ build が実行され、
// append 失敗時は build が実行されないことを検証する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('events/scripts/append-build.mjs');

const makeScratch = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'append-build-test-'));
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(eventsDir, 'snapshots'), { recursive: true });
  return { root, eventsDir };
};

const runWrapper = (eventsDir, args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, EVENTS_DIR: eventsDir },
    encoding: 'utf8',
  });

describe('append-build', () => {
  it('appends and builds on success', () => {
    const { root, eventsDir } = makeScratch();
    const result = runWrapper(eventsDir, ['--set', 'product.name.value', 'X']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('appended 1 events');
    const log = fs.readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8');
    expect(log).toContain('product.name.value');
    expect(fs.existsSync(path.join(eventsDir, 'snapshots', 'product.json'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not build when append fails', () => {
    const { root, eventsDir } = makeScratch();
    const result = runWrapper(eventsDir, ['--set', 'bad.key', 'X']);
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(path.join(eventsDir, 'log.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(eventsDir, 'snapshots', 'product.json'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails on a meta integrity violation without writing anything', () => {
    const { root, eventsDir } = makeScratch();
    const result = runWrapper(eventsDir, [
      '--set',
      'meta.harness.x',
      '{"purpose":"p"}',
      '--set',
      'meta.harness.x.status',
      '{"stage":"ready","text":"t"}',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('has no path');
    expect(fs.existsSync(path.join(eventsDir, 'log.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(eventsDir, 'snapshots', 'meta.json'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
