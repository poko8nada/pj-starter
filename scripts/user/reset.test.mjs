// reset.mjs の境界テスト。スクラッチ EVENTS_DIR で子プロセスで実行する。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'reset.mjs');
const scratches = [];

const CHECKPOINT_SEED = {
  compactedAt: '2026-08-01T00:00:00.000+09:00',
  asOf: '2026-08-01T00:00:00.000+09:00',
  trees: {
    product: {
      name: { value: 'Starter', status: { text: 's' }, updatedAt: '20260801' },
      stack: {
        runtime: 'Node.js 22+',
        status: { text: 'スターターの初期スタック' },
        updatedAt: '20260801',
      },
    },
    meta: {
      skills: {
        agenda: {
          path: '.opencode/skills/agenda/SKILL.md',
          purpose: '作業単位を確定する',
          status: { stage: 'commit', text: 't' },
          updatedAt: '20260801',
        },
      },
    },
  },
};

const makeScratch = ({
  checkpoint = JSON.stringify(CHECKPOINT_SEED),
  logLines = 3,
  extraEvents = [],
} = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-test-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(eventsDir);
  const log = Array.from(
    { length: logLines },
    (_, i) =>
      `${JSON.stringify({ ts: '2026-08-02T00:00:00.000+09:00', type: 'set', key: `log.try.${i}`, value: { tool: 'read', gap: 0, targets: ['a.ts'] } })}\n`,
  ).join('');
  fs.writeFileSync(
    path.join(eventsDir, 'log.jsonl'),
    `${log}${extraEvents.map((event) => `${event}\n`).join('')}`,
  );
  if (checkpoint !== null) fs.writeFileSync(path.join(eventsDir, 'checkpoint.json'), checkpoint);
  for (const name of ['README.md', 'README.ja.md']) {
    fs.writeFileSync(path.join(root, name), `# ${name}`);
  }
  return root;
};

const runReset = (root, args = []) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, EVENTS_DIR: path.join(root, 'events') },
    encoding: 'utf8',
  });

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// 履歴フィールドの混入を深く検査する。
const hasHistoryFields = (value) => {
  if (Array.isArray(value)) return value.some(hasHistoryFields);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, child]) => key === 'status' || key === 'updatedAt' || hasHistoryFields(child),
    );
  }
  return false;
};

afterAll(() => {
  for (const root of scratches) fs.rmSync(root, { recursive: true, force: true });
});

describe('reset.mjs', () => {
  it('dry-run は何も変更せず計画だけを出力する', () => {
    const root = makeScratch();
    const beforeCheckpoint = fs.readFileSync(path.join(root, 'events', 'checkpoint.json'), 'utf8');
    const beforeLog = fs.readFileSync(path.join(root, 'events', 'log.jsonl'), 'utf8');

    const result = runReset(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run]');
    expect(fs.readFileSync(path.join(root, 'events', 'checkpoint.json'), 'utf8')).toBe(
      beforeCheckpoint,
    );
    expect(fs.readFileSync(path.join(root, 'events', 'log.jsonl'), 'utf8')).toBe(beforeLog);
    expect(fs.existsSync(path.join(root, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'events', 'snapshots'))).toBe(false);
  });

  it('--run は初期状態を作り、履歴フィールドと README を取り除く', () => {
    const root = makeScratch();

    const result = runReset(root, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('product: updated');
    expect(fs.existsSync(path.join(root, 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'README.ja.md'))).toBe(false);

    const checkpoint = readJson(path.join(root, 'events', 'checkpoint.json'));
    expect(checkpoint.asOf).toBeNull();
    expect(Object.keys(checkpoint.trees.product)).toEqual(['stack']);
    expect(checkpoint.trees.product.stack.runtime).toBe('Node.js 22+');
    expect(checkpoint.trees.meta.skills.agenda.purpose).toBe('作業単位を確定する');
    expect(hasHistoryFields(checkpoint.trees)).toBe(false);

    const logLines = fs
      .readFileSync(path.join(root, 'events', 'log.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
    expect(logLines).toHaveLength(2);
    const events = logLines.map((line) => JSON.parse(line));
    expect(events.map((event) => event.key)).toEqual(['product.name.value', 'product.what.value']);
    expect(events[0].value).toBe('プロジェクト名が入ります');
    expect(new Set(events.map((event) => event.ts)).size).toBe(1);

    const product = readJson(path.join(root, 'events', 'snapshots', 'product.json'));
    expect(product.content.name.value).toBe('プロジェクト名が入ります');
    expect(product.content.what.value).toBe('今からプロジェクトを作り始める段階です');
    expect(product.content.stack.runtime).toBe('Node.js 22+');
    expect(hasHistoryFields(product.content)).toBe(false);

    const meta = readJson(path.join(root, 'events', 'snapshots', 'meta.json'));
    expect(meta.content.skills.agenda.path).toBe('.opencode/skills/agenda/SKILL.md');
    expect(hasHistoryFields(meta.content)).toBe(false);
  });

  it('--run に名前を渡すと product.name.value に使う', () => {
    const root = makeScratch();

    const result = runReset(root, ['--run', 'My Project']);

    expect(result.status).toBe(0);
    const product = readJson(path.join(root, 'events', 'snapshots', 'product.json'));
    expect(product.content.name.value).toBe('My Project');
  });

  it('空文字の名前はプレースホルダに倒す', () => {
    const root = makeScratch();

    const result = runReset(root, ['--run', '']);

    expect(result.status).toBe(0);
    const product = readJson(path.join(root, 'events', 'snapshots', 'product.json'));
    expect(product.content.name.value).toBe('プロジェクト名が入ります');
  });

  it('不正な JSON の checkpoint.json からでも初期化できる', () => {
    // checkpoint だけが空でも、アクティブログに定義イベントが残っていれば種まきされる
    const root = makeScratch({
      checkpoint: '{ broken json',
      extraEvents: [
        JSON.stringify({
          ts: '2026-08-02T00:00:00.000+09:00',
          type: 'set',
          key: 'meta.skills.audit',
          value: {
            path: '.opencode/skills/audit/SKILL.md',
            purpose: 'コミット前レビュー',
            status: { stage: 'commit', text: 't' },
            updatedAt: '20260802',
          },
        }),
      ],
    });

    const result = runReset(root, ['--run']);

    expect(result.status).toBe(0);
    const checkpoint = readJson(path.join(root, 'events', 'checkpoint.json'));
    expect(checkpoint.trees.meta.skills.audit.purpose).toBe('コミット前レビュー');
    expect(hasHistoryFields(checkpoint.trees)).toBe(false);
    expect(
      readJson(path.join(root, 'events', 'snapshots', 'meta.json')).content.skills.audit,
    ).toHaveProperty('path');
  });

  it('不明な引数は失敗する', () => {
    const root = makeScratch();

    for (const args of [['--nope'], ['extra', '--run'], ['--run', '--flag'], ['--run', 'a', 'b']]) {
      const result = runReset(root, args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unexpected argument');
    }
  });
});
