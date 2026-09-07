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

const runWrapper = (eventsDir, args, options = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: options.env ?? { ...process.env, EVENTS_DIR: eventsDir },
    cwd: options.cwd,
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

  it('omits the branch field when EVENTS_BRANCH is unset and not a git repo', () => {
    const { root, eventsDir } = makeScratch();
    const env = { ...process.env, EVENTS_DIR: eventsDir };
    delete env.EVENTS_BRANCH;
    const result = runWrapper(eventsDir, ['--set', 'product.name.value', 'X'], { env, cwd: root });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8');
    expect(log).not.toContain('"branch"');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('adds the branch field from git when EVENTS_BRANCH is unset', () => {
    const { root, eventsDir } = makeScratch();
    spawnSync('git', ['init', '-b', 'feature/test'], { cwd: root });
    const env = { ...process.env, EVENTS_DIR: eventsDir };
    delete env.EVENTS_BRANCH;
    const result = runWrapper(eventsDir, ['--set', 'product.name.value', 'X'], { env, cwd: root });
    expect(result.status).toBe(0);
    const log = fs.readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8');
    expect(log).toContain('"branch":"feature/test"');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('expands short-form why sets into timestamped entries in why.json', () => {
    const { root, eventsDir } = makeScratch();
    const result = runWrapper(eventsDir, [
      '--set',
      'product.stack.runtime',
      '"node"',
      '--set',
      'product.stack.why',
      '速い',
      '--set',
      'product.stack.whyNot',
      'npm は遅い',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('why: updated');
    const product = JSON.parse(
      fs.readFileSync(path.join(eventsDir, 'snapshots', 'product.json'), 'utf8'),
    );
    expect(product.content.stack.why).toBeUndefined();
    const why = JSON.parse(fs.readFileSync(path.join(eventsDir, 'snapshots', 'why.json'), 'utf8'));
    const ids = Object.keys(why.content['product.stack']);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^\d{8}T\d{9}$/);
    expect(why.content['product.stack'][ids[0]]).toEqual({ why: '速い', whyNot: 'npm は遅い' });
    const log = fs.readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8');
    expect(log).toContain(`product.stack.why.${ids[0]}`);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('accumulates entries across invocations instead of overwriting', () => {
    const { root, eventsDir } = makeScratch();
    expect(runWrapper(eventsDir, ['--set', 'product.stack.why', '一件目']).status).toBe(0);
    expect(runWrapper(eventsDir, ['--set', 'product.stack.why', '二件目']).status).toBe(0);
    const why = JSON.parse(fs.readFileSync(path.join(eventsDir, 'snapshots', 'why.json'), 'utf8'));
    const entries = Object.values(why.content['product.stack']);
    expect(entries).toHaveLength(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects lone whyNot and object-form why without writing anything', () => {
    const { root, eventsDir } = makeScratch();
    const lone = runWrapper(eventsDir, ['--set', 'product.stack.whyNot', 'x']);
    expect(lone.status).not.toBe(0);
    expect(lone.stderr).toContain('whyNot without why');
    const object = runWrapper(eventsDir, ['--set', 'product.stack.why', '{"why":"x"}']);
    expect(object.status).not.toBe(0);
    expect(fs.existsSync(path.join(eventsDir, 'log.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(eventsDir, 'snapshots', 'why.json'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('expands short-form why sets via --file batches too', () => {
    const { root, eventsDir } = makeScratch();
    const draft = path.join(root, 'draft.jsonl');
    fs.writeFileSync(
      draft,
      [
        { type: 'set', key: 'product.stack.why', value: '速い' },
        { type: 'set', key: 'product.stack.whyNot', value: 'npm は遅い' },
      ]
        .map((line) => `${JSON.stringify(line)}\n`)
        .join(''),
    );
    const result = runWrapper(eventsDir, ['--file', draft]);
    expect(result.status).toBe(0);
    const why = JSON.parse(fs.readFileSync(path.join(eventsDir, 'snapshots', 'why.json'), 'utf8'));
    const ids = Object.keys(why.content['product.stack']);
    expect(ids).toHaveLength(1);
    expect(why.content['product.stack'][ids[0]]).toEqual({ why: '速い', whyNot: 'npm は遅い' });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
