// sync-to-starter.mjs の双方向シンクの境界テスト。
// スクラッチのプロジェクト（スクリプト本体をコピー）とスターターを子プロセスで実行する。
// bisync はダミー rclone で代用し、引数をログへ記録する。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'sync-to-starter.mjs');
const SYNC_FILES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'sync/files.mjs');
const SYNC_META = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'sync/meta.mjs');
// lib.mjs が lib/ ディレクトリへ分割されたため、エントリとモジュール群をまとめてコピーする
const EVENTS_SCRIPTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts',
);
const BUILD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts/build.mjs',
);

const copyEventsScripts = (eventsDir) => {
  fs.cpSync(EVENTS_SCRIPTS, path.join(eventsDir, 'scripts'), { recursive: true });
};
const scratches = [];

// ダミー rclone。bisync の引数を RCLONE_ARGS_LOG へ記録し、初回（--resync なし）は"Must run --resync" で abort して再試行を促す。RCLONE_FAIL 時は安全 abort を模す
const DUMMY_BIN = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-bin-'));
scratches.push(DUMMY_BIN);
fs.writeFileSync(
  path.join(DUMMY_BIN, 'rclone'),
  `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RCLONE_ARGS_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'version') process.exit(0);
if (process.env.RCLONE_FAIL && !args.includes('--resync')) {
  console.error('ERROR : Safety abort: all files were changed on Path1');
  process.exit(1);
}
if (!args.includes('--resync')) {
  console.error('ERROR : Bisync aborted. Must run --resync to recover.');
  process.exit(1);
}
process.exit(0);
`,
  { mode: 0o755 },
);

const T = {
  floor: '2026-08-26T00:00:00.000+09:00',
  starterAgenda: '2026-08-27T09:00:00.000+09:00',
  starterFeature: '2026-08-25T12:00:00.000+09:00',
  project: '2026-08-27T10:00:00.000+09:00',
  older: '2026-08-27T08:00:00.000+09:00',
};

// スターターの checkpoint。audit は checkpoint 由来（floor が比較基準）
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

// スターター側のログ。agenda / feature はコミット済み
const STARTER_LOG = [
  {
    ts: T.starterAgenda,
    type: 'set',
    key: 'meta.skills.agenda',
    value: { path: '.opencode/skills/agenda/SKILL.md', purpose: '作業単位を確定する' },
  },
  {
    ts: T.starterAgenda,
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: 'スターター版' },
  },
  {
    ts: T.starterFeature,
    type: 'set',
    key: 'meta.skills.feature',
    value: { path: '.opencode/skills/feature/SKILL.md', purpose: 'feature 登録' },
  },
  {
    ts: T.starterFeature,
    type: 'set',
    key: 'meta.skills.feature.status',
    value: { stage: 'commit', text: '同値' },
  },
];

// プロジェクト側のログ。meta.* 9 件 + 対象外 2 件。
// 期待: INJECT = agenda(1) / audit(5) / old(7)(8)(9) の 5 件。
// KEEP = recon(6)（非コミット）。SKIP = agenda(2)(3) / feature(4)
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
    ts: T.project,
    type: 'set',
    key: 'meta.skills.recon.status',
    value: { stage: 'implement', text: '実装中' },
  },
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.old',
    value: { path: '.opencode/skills/old/SKILL.md', purpose: '旧スキル' },
  },
  {
    ts: T.project,
    type: 'set',
    key: 'meta.skills.old.status',
    value: { stage: 'commit', text: '削除予定' },
  },
  { ts: T.project, type: 'del', key: 'meta.skills.old' },
  { ts: T.project, type: 'set', key: 'product.name.value', value: 'x' },
  {
    ts: T.project,
    type: 'set',
    key: 'log.try.1',
    value: { tool: 'read', gap: 0, targets: ['a.ts'] },
  },
];

const writeLog = (eventsDir, events) => {
  fs.writeFileSync(
    path.join(eventsDir, 'log.jsonl'),
    events.map((event) => `${JSON.stringify(event)}\n`).join(''),
  );
};

// スクラッチのプロジェクト。スクリプト本体と lib/build をコピーし、ログを制御する。
// bisync の単位ディレクトリと rclone 引数ログも用意する
const makeProject = ({ logEvents = PROJECT_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-project-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'user', 'sync'), { recursive: true });
  for (const dir of [
    '.opencode/lib',
    '.opencode/plugin',
    '.opencode/agent',
    '.opencode/skills',
    '.opencode',
    'scripts',
    'events',
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'user', 'sync-to-starter.mjs'));
  fs.copyFileSync(SYNC_FILES, path.join(root, 'scripts', 'user', 'sync', 'files.mjs'));
  fs.copyFileSync(SYNC_META, path.join(root, 'scripts', 'user', 'sync', 'meta.mjs'));
  copyEventsScripts(eventsDir);
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  writeLog(eventsDir, logEvents);
  fs.writeFileSync(path.join(root, 'rclone-args.log'), '');
  return root;
};

// スクラッチのスターター。checkpoint / log を制御する。
// build に必要な scripts は事前コピーしておく（ダミー rclone はコピーしないため）
const makeStarter = ({ checkpoint = CHECKPOINT, logEvents = STARTER_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-starter-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  for (const dir of [
    '.opencode/lib',
    '.opencode/plugin',
    '.opencode/agent',
    '.opencode/skills',
    '.opencode',
    'scripts',
    'events',
  ]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  if (checkpoint !== null) {
    fs.writeFileSync(path.join(eventsDir, 'checkpoint.json'), JSON.stringify(checkpoint));
  }
  writeLog(eventsDir, logEvents);
  copyEventsScripts(eventsDir);
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  return root;
};

const runSync = (projectRoot, starterRoot, args = [], env = {}) =>
  spawnSync(
    process.execPath,
    [path.join(projectRoot, 'scripts/user/sync-to-starter.mjs'), ...args, starterRoot],
    {
      env: {
        ...process.env,
        PATH: `${DUMMY_BIN}:${process.env.PATH}`,
        RCLONE_ARGS_LOG: path.join(projectRoot, 'rclone-args.log'),
        ...env,
      },
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

const readArgsLog = (projectRoot) =>
  fs
    .readFileSync(path.join(projectRoot, 'rclone-args.log'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

// 履歴フィールドの混入を深く検査する
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

describe('sync-to-starter.mjs の双方向シンク', () => {
  it('dry-run は勝敗判定とストリップ計画を表示し、両側を変更しない', () => {
    const project = makeProject();
    const starter = makeStarter();
    const beforeStarterLog = fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8');
    const beforeProjectLog = fs.readFileSync(path.join(project, 'events', 'log.jsonl'), 'utf8');

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('5 件をスターターへ注入 / 4 件スキップ');
    expect(result.stdout).toContain('INJECT meta.skills.agenda.status');
    expect(result.stdout).toContain('SKIP   meta.skills.agenda.status');
    expect(result.stdout).toContain('KEEP   meta.skills.recon.status');
    expect(result.stdout).toContain('no-op（既に同値）');
    expect(result.stdout).toContain('スターター勝ち');
    expect(result.stdout).toContain('コミット済みイベント 8 件を除去');
    expect(result.stdout).not.toContain('product.name.value');
    expect(result.stdout).not.toContain('log.try.1');
    expect(fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8')).toBe(
      beforeStarterLog,
    );
    expect(fs.readFileSync(path.join(project, 'events', 'log.jsonl'), 'utf8')).toBe(
      beforeProjectLog,
    );
    expect(fs.existsSync(path.join(project, 'events', 'checkpoint.json'))).toBe(false);
    expect(fs.existsSync(path.join(starter, 'events', 'snapshots'))).toBe(false);

    const invocations = readArgsLog(project).filter((args) => args[0] === 'bisync');
    expect(invocations.length).toBeGreaterThan(0);
    expect(invocations.every((args) => args.includes('--dry-run'))).toBe(true);
  });

  it('--run はコミット済みのみ注入し、プロジェクト側をストリップして両側で build する', () => {
    const project = makeProject();
    const starter = makeStarter();

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('5 件をスターターへ注入 / 4 件スキップ');
    expect(result.stdout).toContain('meta: updated');

    // スターターのログ: 自前 4 件 + 注入 5 件
    const starterLog = readLog(path.join(starter, 'events'));
    expect(starterLog).toHaveLength(9);
    const injected = starterLog.slice(4);
    expect(injected.map((event) => event.key)).toEqual([
      'meta.skills.agenda.status',
      'meta.skills.audit.status',
      'meta.skills.old',
      'meta.skills.old.status',
      'meta.skills.old',
    ]);
    expect(new Set(injected.map((event) => event.ts))).toEqual(new Set([T.project]));

    // プロジェクトの checkpoint: コミット済み在庫のみ（stripped）+ 折りたたみ済み product
    const checkpoint = readJson(path.join(project, 'events', 'checkpoint.json'));
    expect(checkpoint.asOf).toBeNull();
    expect(Object.keys(checkpoint.trees.meta.skills)).toEqual(['agenda', 'feature', 'audit']);
    expect(checkpoint.trees.meta.skills.agenda).toEqual({
      path: '.opencode/skills/agenda/SKILL.md',
      purpose: '作業単位を確定する',
    });
    expect(hasHistoryFields(checkpoint.trees)).toBe(false);
    expect(checkpoint.trees.product.name.value).toBe('x');

    // プロジェクトのログ: 非コミット + product + turn のみ
    const projectLog = readLog(path.join(project, 'events'));
    expect(projectLog.map((event) => event.key)).toEqual([
      'meta.skills.recon.status',
      'product.name.value',
      'log.try.1',
    ]);

    // プロジェクトの meta.json: コミット済みは raw、recon は implement のまま
    const projectMeta = readJson(path.join(project, 'events', 'snapshots', 'meta.json'));
    expect(projectMeta.content.skills.agenda.status).toBeUndefined();
    expect(projectMeta.content.skills.audit.status).toBeUndefined();
    expect(projectMeta.content.skills.recon.status.stage).toBe('implement');

    // スターターの meta.json: 注入が反映され、old は削除済み
    const starterMeta = readJson(path.join(starter, 'events', 'snapshots', 'meta.json'));
    expect(starterMeta.content.skills.agenda.status.text).toBe('プロジェクト改訂');
    expect(starterMeta.content.skills.audit.status.text).toBe('プロジェクト改訂');
    expect(starterMeta.content.skills.feature.status.text).toBe('同値');
    expect(starterMeta.content.skills.old).toBeUndefined();
  });

  it('再実行は冪等で、注入済みイベントは残らず何も起きない', () => {
    const project = makeProject();
    const starter = makeStarter();

    expect(runSync(project, starter, ['--run']).status).toBe(0);
    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 件をスターターへ注入 / 1 件スキップ');
    expect(readLog(path.join(starter, 'events'))).toHaveLength(9);
    expect(readLog(path.join(project, 'events'))).toHaveLength(3);
  });

  it('bisync の引数は単位・除外・フィルタ・初回 resync を含む', () => {
    const project = makeProject();
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    const invocations = readArgsLog(project).filter((args) => args[0] === 'bisync');
    // 8 単位 ×（初回 + resync 再試行）
    expect(invocations).toHaveLength(16);
    const firsts = invocations.filter((args) => !args.includes('--resync'));
    const retries = invocations.filter((args) => args.includes('--resync'));
    expect(firsts).toHaveLength(8);
    expect(retries).toHaveLength(8);
    for (const retry of retries) {
      expect(retry).toContain('--resync');
      expect(retry).toContain('--resync-mode');
      expect(retry).toContain('newer');
    }

    const allArgs = invocations.flat();
    for (const unitPath of [
      '.opencode/lib',
      '.opencode/plugin',
      '.opencode/agent',
      '.opencode/skills',
      'scripts',
      'events',
    ]) {
      expect(allArgs.some((arg) => arg.endsWith(unitPath))).toBe(true);
    }
    for (const pattern of [
      'node_modules/**',
      '**/.DS_Store',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
    ]) {
      expect(allArgs).toContain(pattern);
    }
    for (const pattern of [
      '+ tsconfig.json',
      '+ package.json',
      '+ .gitignore',
      '+ AGENTS.md',
      '+ lefthook.yaml',
      '- *',
    ]) {
      expect(allArgs).toContain(pattern);
    }
    for (const pattern of ['log.jsonl', 'checkpoint.json', 'snapshots/**']) {
      expect(allArgs).toContain(pattern);
    }
  });

  it('bisync の失敗（安全 abort など）は全体を失敗させ、meta フローは実行されない', () => {
    const project = makeProject();
    const starter = makeStarter();
    const beforeStarterLog = fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8');

    const result = runSync(project, starter, [], { RCLONE_FAIL: '1' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bisync が一部の対象で失敗しました');
    expect(fs.readFileSync(path.join(starter, 'events', 'log.jsonl'), 'utf8')).toBe(
      beforeStarterLog,
    );
  });

  it('スターター側に単位ディレクトリが無ければその単位をスキップする', () => {
    const project = makeProject();
    const starter = makeStarter();
    fs.rmSync(path.join(starter, '.opencode', 'agent'), { recursive: true });

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skip (not found): .opencode/agent');
    const invocations = readArgsLog(project).filter((args) => args[0] === 'bisync');
    // 7 単位 ×（初回 + resync 再試行）
    expect(invocations).toHaveLength(14);
  });

  it('存在しないキーへの del は KEEP としてプロジェクトに残る', () => {
    const project = makeProject({
      logEvents: [{ ts: T.project, type: 'del', key: 'meta.skills.notExists' }],
    });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('KEEP   meta.skills.notExists  del');
    expect(readLog(path.join(project, 'events'))).toHaveLength(1);
  });

  it('floor 同値のイベントはスターター勝ちでスキップされる', () => {
    const project = makeProject({
      logEvents: [
        {
          ts: T.floor,
          type: 'set',
          key: 'meta.skills.audit.status',
          value: { stage: 'commit', text: 'floor同値' },
        },
      ],
    });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SKIP   meta.skills.audit.status');
    expect(result.stdout).toContain('スターター勝ち');
  });

  it('スターターに log.jsonl が無くてもクラッシュせず、checkpoint 由来で判定できる', () => {
    const project = makeProject();
    const starter = makeStarter({ checkpoint: CHECKPOINT, logEvents: [] });
    fs.rmSync(path.join(starter, 'events', 'log.jsonl'));

    const result = runSync(project, starter, ['--run']);

    expect(result.status).toBe(0);
    // ログが無いため agenda/feature は未存在扱いで全注入。audit は checkpoint 由来（floor 比較）でプロジェクト勝ち
    expect(result.stdout).toContain('8 件をスターターへ注入 / 1 件スキップ');
    const starterMeta = readJson(path.join(starter, 'events', 'snapshots', 'meta.json'));
    expect(starterMeta.content.skills.audit.status.text).toBe('プロジェクト改訂');
  });

  it('プロジェクトのログが空なら注入なしで成功する', () => {
    const project = makeProject({ logEvents: [] });
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 件をスターターへ注入 / 0 件スキップ');
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

  it('不正な JSON 行は行番号付きで失敗する', () => {
    const project = makeProject({ logEvents: [] });
    fs.writeFileSync(path.join(project, 'events', 'log.jsonl'), 'not json\n');
    const starter = makeStarter();

    const result = runSync(project, starter);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('line 1');
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
