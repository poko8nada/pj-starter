// sync-to-starter.mjs の注入ロジックの境界テスト。
// スクラッチのプロジェクト（スクリプト本体をコピー）とスターターを子プロセスで実行する。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'sync-to-starter.mjs');
const LIB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts/lib.mjs',
);
const BUILD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts/build.mjs',
);
const scratches = [];

// 本テストは meta.* 注入のみを検証する。rclone による TARGETS コピーは既存動作・未変更のため
// スコープ外。rclone 未導入環境でも密閉して動かすため、何もしないダミー rclone を PATH に置く
const DUMMY_BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-bin-'));
scratches.push(DUMMY_BIN);
fs.writeFileSync(path.join(DUMMY_BIN, 'rclone'), '#!/usr/bin/env node\nprocess.exit(0)\n', {
  mode: 0o755,
});

const T = {
  floor: '2026-08-26T00:00:00.000+09:00',
  starterAgenda: '2026-08-27T09:00:00.000+09:00',
  starterFeature: '2026-08-25T12:00:00.000+09:00',
  project: '2026-08-27T10:00:00.000+09:00',
  older: '2026-08-27T08:00:00.000+09:00',
};

const CHECKPOINT = {
  compactedAt: T.floor,
  asOf: T.floor,
  trees: {
    product: {},
    meta: {
      skills: {
        audit: {
          path: '.opencode/skills/audit/SKILL.md',
          purpose: 'コミット前レビュー',
          status: { stage: 'commit', text: 'スターター版' },
          updatedAt: '20260826',
        },
      },
    },
  },
};

// スターター側のログ。agenda は 09:00、feature は 08-25 に触れている
const STARTER_LOG = [
  {
    ts: T.starterAgenda,
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: 'スターターが新しい' },
  },
  {
    ts: T.starterFeature,
    type: 'set',
    key: 'meta.skills.feature.status',
    value: { stage: 'commit', text: '同値' },
  },
];

// プロジェクト側のログ。meta.* 9 件 + 対象外 2 件。
// 期待: INJECT = agenda.status(1) / audit.status(5) / recon.status(7) / recon del(8) / agenda del(9) の 5 件。
// (8) は同一バッチ内で (7) が先に set しているため working 上でキーが存在し、注入される
const PROJECT_LOG = [
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: 'プロジェクト改訂' },
  },
  {
    ts: T.older,
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: '古い' },
  },
  {
    ts: T.starterAgenda,
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: '同ts' },
  },
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.feature.status',
    value: { stage: 'commit', text: '同値' },
  },
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.audit.status',
    value: { stage: 'commit', text: 'プロジェクト改訂' },
  },
  {
    ts: T.floor,
    type: 'set',
    key: 'meta.skills.audit.status',
    value: { stage: 'commit', text: 'floor同値' },
  },
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.recon.status',
    value: { stage: 'commit', text: '新規' },
  },
  { ts: T.project, type: 'del', key: 'meta.skills.recon' },
  { ts: T.project, type: 'del', key: 'meta.skills.agenda' },
  { ts: T.project, type: 'set', key: 'product.name.value', value: 'x' },
  { ts: T.project, type: 'set', key: 'log.turn.1', value: { events: [], reasoning: 0 } },
];

const writeLog = (eventsDir, events) => {
  fs.writeFileSync(
    path.join(eventsDir, 'log.jsonl'),
    events.map((event) => `${JSON.stringify(event)}\n`).join(''),
  );
};

// スクラッチのプロジェクト。スクリプト本体と lib/build をコピーし、ログを制御する
const makeProject = ({ logEvents = PROJECT_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-project-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'user'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'user', 'sync-to-starter.mjs'));
  fs.copyFileSync(LIB, path.join(eventsDir, 'scripts', 'lib.mjs'));
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  writeLog(eventsDir, logEvents);
  return root;
};

// スクラッチのスターター。checkpoint / log を制御する。
// build に必要な scripts は事前コピーしておく（ダミー rclone はコピーしないため）
const makeStarter = ({ checkpoint = CHECKPOINT, logEvents = STARTER_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-starter-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  if (checkpoint !== null)
    fs.writeFileSync(path.join(eventsDir, 'checkpoint.json'), JSON.stringify(checkpoint));
  writeLog(eventsDir, logEvents);
  fs.copyFileSync(LIB, path.join(eventsDir, 'scripts', 'lib.mjs'));
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  return root;
};

const runSync = (projectRoot, starterRoot, args = []) =>
  spawnSync(
    process.execPath,
    [path.join(projectRoot, 'scripts/user/sync-to-starter.mjs'), ...args, starterRoot],
    {
      env: { ...process.env, PATH: `${DUMMY_BIN}:${process.env.PATH}` },
      encoding: 'utf8',
    },
  );

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const readLog = (eventsDir) =>
  fs
    .readFileSync(path.join(eventsDir, 'log.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

afterAll(() => {
  for (const root of scratches) fs.rmSync(root, { recursive: true, force: true });
});

describe('sync-to-starter.mjs のログ注入', () => {
  it('dry-run は勝敗判定を表示し、スターターを変更しない', () => {
    const project = makeProject();
    const starter = makeStarter();
    const beforeLog = fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8');

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('5 件を注入 / 4 件スキップ');
    expect(result.stdout).toContain('INJECT meta.skills.agenda.status');
    expect(result.stdout).toContain('SKIP   meta.skills.agenda.status');
    expect(result.stdout).toContain('no-op（既に同値）');
    expect(result.stdout).toContain('スターター勝ち');
    expect(result.stdout).not.toContain('product.name.value');
    expect(result.stdout).not.toContain('log.turn.1');
    expect(fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8')).toBe(beforeLog);
    expect(fs.existsSync(path.join(starter, 'events', 'snapshots'))).toBe(false);
  });

  it('--run は勝者イベントだけを元の ts のまま順序どおり注入し、build で meta.json を更新する', () => {
    const project = makeProject();
    const starter = makeStarter();

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('5 件を注入 / 4 件スキップ');
    expect(result.stdout).toContain('meta: updated');

    const log = readLog(path.join(starter, 'events'));
    expect(log).toHaveLength(7);
    const injected = log.slice(2);
    expect(injected.map((event) => event.key)).toEqual([
      'meta.skills.agenda.status',
      'meta.skills.audit.status',
      'meta.skills.recon.status',
      'meta.skills.recon',
      'meta.skills.agenda',
    ]);
    expect(new Set(injected.map((event) => event.ts))).toEqual(new Set([T.project]));

    const meta = readJson(path.join(starter, 'events', 'snapshots', 'meta.json'));
    expect(meta.content.skills.agenda).toBeUndefined();
    expect(meta.content.skills.audit.status.text).toBe('プロジェクト改訂');
    expect(meta.content.skills.feature.status.text).toBe('同値');
    expect(meta.content.skills.recon).toBeUndefined();
    expect(meta.asOf).toBe(T.project);
  });

  it('再実行は冪等で、注入済みイベントは no-op としてスキップされる', () => {
    const project = makeProject();
    const starter = makeStarter();

    expect(runSync(project, starter, ['--run']).status).toBe(0);
    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 件を注入 / 9 件スキップ');
    expect(readLog(path.join(starter, 'events'))).toHaveLength(7);
  });

  it('スターターに log.jsonl が無くてもクラッシュせず、全イベントを注入できる', () => {
    const project = makeProject();
    const starter = makeStarter({ checkpoint: null, logEvents: [] });
    fs.rmSync(path.join(starter, 'events', 'log.jsonl'));

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('9 件を注入 / 0 件スキップ');
    expect(readLog(path.join(starter, 'events'))).toHaveLength(9);
    expect(fs.existsSync(path.join(starter, 'events', 'snapshots', 'meta.json'))).toBe(true);
  });

  it('checkpoint あり・log なし（compact 直後）でも checkpoint 由来キーは floor で判定される', () => {
    const project = makeProject();
    const starter = makeStarter({ checkpoint: CHECKPOINT, logEvents: [] });
    fs.rmSync(path.join(starter, 'events', 'log.jsonl'));

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    // absent キーは ts に関わらず常にプロジェクト勝ちのため、agenda.status の古いイベント(2)(3)も
    // 注入され、順序どおり最後の「同ts」で上書きされる。floor 同値の audit.status(6) だけが
    // スターター勝ちでスキップされる
    expect(result.stdout).toContain('8 件を注入 / 1 件スキップ');
    expect(result.stdout).toContain('スターター勝ち');
    const meta = readJson(path.join(starter, 'events', 'snapshots', 'meta.json'));
    expect(meta.content.skills.audit.status.text).toBe('プロジェクト改訂');
  });

  it('スターターの log.jsonl が空でも空ログとして扱う', () => {
    const project = makeProject();
    const starter = makeStarter({ checkpoint: null, logEvents: [] });

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('9 件を注入 / 0 件スキップ');
  });

  it('存在しないキーへの del は no-op としてスキップされる', () => {
    const project = makeProject({
      logEvents: [{ ts: T.project, type: 'del', key: 'meta.skills.notExists' }],
    });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 件を注入 / 1 件スキップ');
    expect(result.stdout).toContain('no-op（キーなし）');
  });

  it('不正な JSON 行は行番号付きで失敗する', () => {
    const project = makeProject({ logEvents: [] });
    fs.writeFileSync(path.join(project, 'events', 'log.jsonl'), 'not json\n');
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('line 1');
  });

  it('プロジェクトのログが空なら注入なしで成功する', () => {
    const project = makeProject({ logEvents: [] });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 件を注入 / 0 件スキップ');
  });

  it('プロジェクトに events/log.jsonl が無ければ注入をスキップする', () => {
    const project = makeProject({ logEvents: [] });
    fs.rmSync(path.join(project, 'events', 'log.jsonl'));
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('プロジェクトに events/log.jsonl がない');
  });

  it('スターターに events/ が無ければ注入をスキップする', () => {
    const project = makeProject();
    const starter = makeStarter();
    fs.rmSync(path.join(starter, 'events'), { recursive: true });

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('スターターに events/ がない');
  });

  it('不正な meta イベントは行番号付きで失敗する', () => {
    const project = makeProject({
      logEvents: [
        {
          ts: T.project,
          type: 'set',
          key: 'meta.skills.x.status',
          value: { stage: 'bogus', text: 't' },
        },
      ],
    });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('line 1');
    expect(result.stderr).toContain('stage');
  });
});
