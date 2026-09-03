// compact のテスト。生存行選別の正常系・異常系と CLI 境界（畳み込み等価を含む）を検証する
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectSurvivors } from './compact.mjs';

const COMPACT = path.resolve('events/scripts/compact.mjs');
const BUILD = path.resolve('events/scripts/build.mjs');

const set = (key, value) => ({ ts: '2026-09-03T00:00:00.000+09:00', type: 'set', key, value });
const del = (key) => ({ ts: '2026-09-03T00:00:00.000+09:00', type: 'del', key });

describe('selectSurvivors', () => {
  it('keeps only the last occurrence per key in original order', () => {
    const events = [
      set('product.name.value', 'v1'),
      set('product.what.value', 'w'),
      set('product.name.value', 'v2'),
    ];
    expect(selectSurvivors(events)).toEqual([events[1], events[2]]);
  });

  it('keeps dels as survivors', () => {
    const events = [set('product.name.value', 'v1'), del('product.name.value')];
    expect(selectSurvivors(events)).toEqual([events[1]]);
  });

  it('drops fold-excluded trail lines', () => {
    const trail = set('log.try.12345678', { tool: 'read', gap: 0, targets: ['a'] });
    const events = [trail, set('product.name.value', 'v1')];
    expect(selectSurvivors(events)).toEqual([events[1]]);
  });

  it('returns empty for empty input', () => {
    expect(selectSurvivors([])).toEqual([]);
  });
});

describe('CLI boundary', () => {
  const makeScratch = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-test-'));
    const eventsDir = path.join(root, 'events');
    fs.mkdirSync(path.join(eventsDir, 'snapshots'), { recursive: true });
    return { root, eventsDir };
  };

  const run = (script, eventsDir) =>
    spawnSync(process.execPath, [script], {
      env: { ...process.env, EVENTS_DIR: eventsDir },
      encoding: 'utf8',
    });

  const snapshotContent = (eventsDir) =>
    JSON.parse(fs.readFileSync(path.join(eventsDir, 'snapshots', 'product.json'), 'utf8')).content;

  it('thins the log while keeping the folded snapshot identical', () => {
    const { root, eventsDir } = makeScratch();
    const lines = [
      set('product.name.value', 'v1'),
      set('product.what.value', 'w'),
      set('log.try.12345678', { tool: 'read', gap: 0, targets: ['a'] }),
      set('product.name.value', 'v2'),
    ];
    fs.writeFileSync(
      path.join(eventsDir, 'log.jsonl'),
      `${lines.map((e) => JSON.stringify(e)).join('\n')}\n`,
    );
    expect(run(BUILD, eventsDir).status).toBe(0);
    const before = snapshotContent(eventsDir);

    const compacted = run(COMPACT, eventsDir);
    expect(compacted.status).toBe(0);
    expect(compacted.stdout).toContain('compacted');
    const remaining = fs
      .readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    expect(remaining).toHaveLength(2);
    expect(remaining.join('\n')).toContain('"v2"');
    expect(remaining.join('\n')).not.toContain('log.try');
    expect(fs.existsSync(path.join(eventsDir, 'checkpoint.json'))).toBe(true);

    expect(run(BUILD, eventsDir).status).toBe(0);
    expect(snapshotContent(eventsDir)).toEqual(before);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes a checkpoint when the log is absent', () => {
    const { root, eventsDir } = makeScratch();
    const result = run(COMPACT, eventsDir);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(eventsDir, 'checkpoint.json'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
