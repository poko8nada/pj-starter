// new.mjs の境界テスト。子プロセスで実行し、スクラッチ起点＋一時親で安全に検証する。
// dry-run・用法・検証は読み取りのみ。実行系はスクラッチに閉じる（実 pnpm install は実行しない）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'new.mjs');
const GROUPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'groups.mjs');
const INIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'new', 'init.mjs');
const EVENTS_SCRIPTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts',
);
const scratches = [];

// スクラッチの起点（new.mjs + groups.mjs + init.mjs + 駆動一式。用度・検証のテストに使う）
const makeStarter = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'new-test-starter-'));
  scratches.push(root);
  fs.mkdirSync(path.join(root, 'scripts', 'user', 'new'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'user', 'new.mjs'));
  fs.copyFileSync(GROUPS, path.join(root, 'scripts', 'user', 'groups.mjs'));
  fs.copyFileSync(INIT, path.join(root, 'scripts', 'user', 'new', 'init.mjs'));
  fs.cpSync(EVENTS_SCRIPTS, path.join(root, 'events', 'scripts'), { recursive: true });
  return root;
};

const makeParent = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'new-test-parent-'));
  scratches.push(root);
  return root;
};

const runNew = (args = [], env = {}, script = SCRIPT) =>
  spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

const readLog = (dest) =>
  fs
    .readFileSync(path.join(dest, 'events', 'log.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));

// 複写元の起点（new 群の一部だけ種まきする）
const makeFullStarter = () => {
  const root = makeStarter();
  const write = (rel, content) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('.oxlintrc.json', '{}\n');
  write('pnpm-workspace.yaml', 'packages: []\n');
  write('scripts/user/keep.mjs', '// keep\n');
  write('scripts/user/new/inner.mjs', '// new inner\n');
  write('.opencode/tsconfig.json', '{}\n');
  write('.opencode/other.txt', 'not synced\n');
  write('events/scripts/x.mjs', '// x\n');
  write(
    'events/log.jsonl',
    [
      {
        ts: '2026-09-01T00:00:00.000+09:00',
        type: 'set',
        key: 'meta.skills.agenda',
        value: { path: '.opencode/skills/agenda/SKILL.md', purpose: '作業単位を確定する' },
      },
      {
        ts: '2026-09-01T00:00:00.000+09:00',
        type: 'set',
        key: 'meta.skills.agenda.status',
        value: { stage: 'commit', text: '起点版' },
      },
      {
        ts: '2026-09-01T00:00:00.000+09:00',
        type: 'set',
        key: 'meta.skills.recon',
        value: { path: '.opencode/skills/recon/SKILL.md', purpose: '実装前調査' },
      },
      {
        ts: '2026-09-01T00:00:00.000+09:00',
        type: 'set',
        key: 'meta.skills.recon.status',
        value: { stage: 'implement', text: '進行中' },
      },
    ]
      .map((event) => `${JSON.stringify(event)}\n`)
      .join(''),
  );
  write('extra.txt', 'not in any group\n');
  return root;
};

afterAll(() => {
  for (const root of scratches) fs.rmSync(root, { recursive: true, force: true });
});

describe('new.mjs の骨格', () => {
  it('引数なしは用法を表示する', () => {
    const result = runNew([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('usage:');
    expect(result.stdout).toContain('new 対象群:');
  });

  it('名前あり・--run なしは dry-run プレビューで全工程を表示し、何も作らない', () => {
    const starter = makeStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();

    const result = runNew(['--in', parent, 'myproj'], {}, script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`対象: ${path.join(parent, 'myproj')}`);
    expect(result.stdout).toContain('実行: scaffold 複写');
    expect(result.stdout).toContain('実行: 空 README 生成');
    expect(result.stdout).toContain('実行: git 初期化');
    expect(result.stdout).toContain('実行: pnpm 導入');
    expect(result.stdout).toContain('実行: イベント初期化');
    expect(result.stdout).toContain('実行: スナップショット再生成');
    expect(result.stdout).toContain('[dry-run]');
    expect(fs.existsSync(path.join(parent, 'myproj'))).toBe(false);
  });

  it('名前の検証に失敗すると実行しない', () => {
    const parent = makeParent();

    for (const bad of ['a/b', '..', '.']) {
      const result = runNew(['--in', parent, bad]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('単一のディレクトリ名');
    }
  });

  it('対象が起点と同じ場合は拒否する', () => {
    const starter = makeStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');

    const result = runNew(['--in', path.dirname(starter), path.basename(starter)], {}, script);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('中止: 対象が起点と同じです');
  });

  it('空でない対象は --force なしで拒否する', () => {
    const parent = makeParent();
    fs.mkdirSync(path.join(parent, 'taken'));
    fs.writeFileSync(path.join(parent, 'taken', 'keep.txt'), 'x');

    const result = runNew(['--in', parent, 'taken']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('中止: 対象が空ではありません');
  });

  it('--force 付きなら非空対象にも複写できる（既存ファイルは残る）', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();
    fs.mkdirSync(path.join(parent, 'taken'));
    fs.writeFileSync(path.join(parent, 'taken', 'keep.txt'), 'x');

    const result = runNew(
      [
        '--in',
        parent,
        'taken',
        '--run',
        '--force',
        '--skip-readme',
        '--skip-git',
        '--skip-install',
        '--skip-events',
        '--skip-build',
      ],
      {},
      script,
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(parent, 'taken', 'keep.txt'), 'utf8')).toBe('x');
    expect(fs.existsSync(path.join(parent, 'taken', '.oxlintrc.json'))).toBe(true);
  });

  it('対象がファイルの場合は拒否する', () => {
    const parent = makeParent();
    fs.writeFileSync(path.join(parent, 'afile'), 'x');

    const result = runNew(['--in', parent, 'afile']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('中止: 対象がディレクトリではありません');
  });
});

describe('new.mjs の scaffold 複写', () => {
  it('--run で new 群だけが複写され、状態・対象外は運ばない', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();
    const target = path.join(parent, 'proj');

    const result = runNew(
      [
        '--in',
        parent,
        'proj',
        '--run',
        '--skip-readme',
        '--skip-git',
        '--skip-install',
        '--skip-events',
        '--skip-build',
      ],
      {},
      script,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('完了: scaffold 複写');
    // new 群は運ばれる（allowlist 遵守・new 自身は除外）
    expect(fs.readFileSync(path.join(target, '.oxlintrc.json'), 'utf8')).toBe('{}\n');
    expect(fs.existsSync(path.join(target, 'pnpm-workspace.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'scripts', 'user', 'keep.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'scripts', 'user', 'groups.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(target, '.opencode', 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'events', 'scripts', 'x.mjs'))).toBe(true);
    // 対象外・状態・new 自身は運ばない
    expect(fs.existsSync(path.join(target, 'scripts', 'user', 'new.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'scripts', 'user', 'new'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.opencode', 'other.txt'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'events', 'log.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'extra.txt'))).toBe(false);
  });
});

describe('new.mjs の仕上げ工程', () => {
  it('--run --skip-install で全工程が通り、初回コミット前の状態になる', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();
    const target = path.join(parent, 'proj');

    const result = runNew(['--in', parent, 'proj', '--run', '--skip-install'], {}, script);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('new 完了');
    // git・空 README
    expect(fs.existsSync(path.join(target, '.git'))).toBe(true);
    expect(fs.readFileSync(path.join(target, 'README.md'), 'utf8')).toBe('');
    expect(fs.readFileSync(path.join(target, 'README.ja.md'), 'utf8')).toBe('');
    // log は name/what の 2 イベントのみ
    expect(readLog(target).map((event) => event.key)).toEqual([
      'product.name.value',
      'product.what.value',
    ]);
    // checkpoint: 起点の在庫 meta（stripped）で種まき
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(target, 'events', 'checkpoint.json'), 'utf8'),
    );
    expect(checkpoint.trees.meta.skills.agenda).toEqual({
      path: '.opencode/skills/agenda/SKILL.md',
      purpose: '作業単位を確定する',
    });
    // 非コミット（implement）の在庫は種まきに含まれない
    expect(checkpoint.trees.meta.skills.recon).toBeUndefined();
    // build でスナップショット再生成
    const product = JSON.parse(
      fs.readFileSync(path.join(target, 'events', 'snapshots', 'product.json'), 'utf8'),
    );
    expect(product.content.name.value).toBe('プロジェクト名が入ります');
  });

  it('イベント工程のみ・log 不在でも初期化できる', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();
    const target = path.join(parent, 'proj');
    fs.mkdirSync(target, { recursive: true });

    const result = runNew(
      [
        '--in',
        parent,
        'proj',
        '--run',
        '--skip-scaffold',
        '--skip-readme',
        '--skip-git',
        '--skip-install',
        '--skip-build',
      ],
      {},
      script,
    );

    expect(result.status).toBe(0);
    expect(readLog(target).map((event) => event.key)).toEqual([
      'product.name.value',
      'product.what.value',
    ]);
  });

  it('pnpm 導入の失敗は即時失敗する', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();

    const result = runNew(
      [
        '--in',
        parent,
        'proj',
        '--run',
        '--skip-scaffold',
        '--skip-readme',
        '--skip-git',
        '--skip-events',
        '--skip-build',
      ],
      { PNPM_BIN: 'false' },
      script,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('pnpm 導入 が失敗しました');
  });

  it('コミット履歴のある対象は拒否する', () => {
    const starter = makeFullStarter();
    const script = path.join(starter, 'scripts', 'user', 'new.mjs');
    const parent = makeParent();
    const target = path.join(parent, 'proj');
    fs.mkdirSync(target, { recursive: true });
    const git = (args) => spawnSync('git', args, { cwd: target, stdio: 'pipe' });
    git(['init']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'x']);

    const result = runNew(
      [
        '--in',
        parent,
        'proj',
        '--run',
        '--force',
        '--skip-scaffold',
        '--skip-readme',
        '--skip-install',
        '--skip-events',
        '--skip-build',
      ],
      {},
      script,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('コミット履歴');
  });
});
