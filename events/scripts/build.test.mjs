// build のテスト。CLI境界（スナップショット再生成＋ビルド時oxfmt整形）を検証する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BUILD = path.resolve('events/scripts/build.mjs');

const set = (key, value) => ({ ts: '2026-09-03T00:00:00.000+09:00', type: 'set', key, value });

const makeScratch = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'snapshots'), { recursive: true });
  return { root, eventsDir };
};

const seedLog = (eventsDir) => {
  const lines = [set('product.name.value', 'v1'), set('product.what.value', 'w')];
  fs.writeFileSync(eventsDir + '/log.jsonl', `${lines.map((e) => JSON.stringify(e)).join('\n')}\n`);
};

const run = (eventsDir, extraEnv = {}) =>
  spawnSync(process.execPath, [BUILD], {
    env: { ...process.env, EVENTS_DIR: eventsDir, ...extraEnv },
    encoding: 'utf8',
  });

const productFile = (eventsDir) => path.join(eventsDir, 'snapshots', 'product.json');

// fake oxfmt を対象プロジェクト直下に植える。呼び出し引数を記録し、指定の終了コードで終わる
const plantFakeOxfmt = (root, status, logFile) => {
  const binDir = path.join(root, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const bin = path.join(binDir, 'oxfmt');
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" >> "${logFile}"\nexit ${status}\n`);
  fs.chmodSync(bin, 0o755);
};

describe('CLI boundary', () => {
  it('writes snapshots without formatting when oxfmt is absent', () => {
    const { root, eventsDir } = makeScratch();
    seedLog(eventsDir);
    const result = run(eventsDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('product: updated');
    const parsed = JSON.parse(fs.readFileSync(productFile(eventsDir), 'utf8'));
    expect(parsed.content).toEqual({
      name: { value: 'v1', status: undefined, updatedAt: undefined },
      what: { value: 'w', status: undefined, updatedAt: undefined },
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('formats only written snapshots when oxfmt is present', () => {
    const { root, eventsDir } = makeScratch();
    seedLog(eventsDir);
    const logFile = path.join(root, 'oxfmt-args.log');
    plantFakeOxfmt(root, 0, logFile);
    const first = run(eventsDir);
    expect(first.status).toBe(0);
    const invoked = fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
    expect(invoked).toEqual([productFile(eventsDir)]);
    // 内容不変の2回目は書き換えが無いため整形も走らない
    const second = run(eventsDir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('product: up to date');
    const invokedAgain = fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
    expect(invokedAgain).toEqual([productFile(eventsDir)]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps raw output and succeeds when oxfmt fails', () => {
    const { root, eventsDir } = makeScratch();
    seedLog(eventsDir);
    const logFile = path.join(root, 'oxfmt-args.log');
    plantFakeOxfmt(root, 3, logFile);
    const result = run(eventsDir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(fs.readFileSync(productFile(eventsDir), 'utf8'));
    expect(parsed.content.name).toMatchObject({ value: 'v1' });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
