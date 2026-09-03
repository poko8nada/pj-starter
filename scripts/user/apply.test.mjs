// apply.mjs の境界テスト。スクラッチのプロジェクト（スクリプト本体をコピー）とスターターを子プロセスで実行する。
// PROJECT_ROOT は EVENTS_DIR から解決されるため、実リポジトリを触らない。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'apply.mjs');
const FILES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'apply/files.mjs');
const META = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'apply/meta.mjs');
const EVENTS_SCRIPTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts',
);
const BUILD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../events/scripts/build.mjs',
);
const scratches = [];

// ダミーの events ツリー（build が動く最低限）を用意する
const seedEvents = (eventsDir) => {
  fs.cpSync(EVENTS_SCRIPTS, path.join(eventsDir, 'scripts'), { recursive: true });
};

const STARTER_CHECKPOINT = {
  compactedAt: '2026-09-01T00:00:00.000+09:00',
  asOf: '2026-09-01T00:00:00.000+09:00',
  trees: {
    product: {},
    meta: {
      skills: {
        agenda: {
          path: '.opencode/skills/agenda/SKILL.md',
          purpose: '作業単位を確定する',
          status: { stage: 'commit', text: 'スターター版' },
          updatedAt: '20260801',
        },
        recon: {
          path: '.opencode/skills/recon/SKILL.md',
          purpose: '実装前調査',
          status: { stage: 'implement', text: '実装中' },
          updatedAt: '20260801',
        },
      },
    },
  },
};

const STARTER_LOG = [
  {
    ts: '2026-09-01T01:00:00.000+09:00',
    type: 'set',
    key: 'meta.skills.audit',
    value: { path: '.opencode/skills/audit/SKILL.md', purpose: 'コミット前レビュー' },
  },
  {
    ts: '2026-09-01T01:00:00.000+09:00',
    type: 'set',
    key: 'meta.skills.audit.status',
    value: { stage: 'commit', text: 'スターター版' },
  },
];

const PROJECT_LOG = [
  {
    ts: '2026-09-01T02:00:00.000+09:00',
    type: 'set',
    key: 'meta.skills.agenda.status',
    value: { stage: 'commit', text: 'プロジェクト改訂' },
  },
  {
    ts: '2026-09-01T02:00:00.000+09:00',
    type: 'set',
    key: 'meta.skills.recon.status',
    value: { stage: 'implement', text: 'プロジェクト進行中' },
  },
  {
    ts: '2026-09-01T02:00:00.000+09:00',
    type: 'set',
    key: 'product.name.value',
    value: 'x',
  },
];

const writeLog = (eventsDir, events) => {
  fs.writeFileSync(
    path.join(eventsDir, 'log.jsonl'),
    events.map((event) => `${JSON.stringify(event)}\n`).join(''),
  );
};

const makeProject = ({ logEvents = PROJECT_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-test-project-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'user', 'apply'), { recursive: true });
  for (const dir of ['.opencode/lib', '.opencode/agent', '.opencode/skills', '.opencode']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts', 'user', 'apply.mjs'));
  fs.copyFileSync(FILES, path.join(root, 'scripts', 'user', 'apply', 'files.mjs'));
  fs.copyFileSync(META, path.join(root, 'scripts', 'user', 'apply', 'meta.mjs'));
  seedEvents(eventsDir);
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  writeLog(eventsDir, logEvents);
  return root;
};

const makeStarter = ({ checkpoint = STARTER_CHECKPOINT, logEvents = STARTER_LOG } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-test-starter-'));
  scratches.push(root);
  const eventsDir = path.join(root, 'events');
  fs.mkdirSync(path.join(eventsDir, 'scripts'), { recursive: true });
  for (const dir of ['.opencode/lib', '.opencode/agent', '.opencode/skills', '.opencode']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  seedEvents(eventsDir);
  fs.copyFileSync(BUILD, path.join(eventsDir, 'scripts', 'build.mjs'));
  if (checkpoint !== null) {
    fs.writeFileSync(path.join(eventsDir, 'checkpoint.json'), JSON.stringify(checkpoint));
  }
  writeLog(eventsDir, logEvents);
  return root;
};

const runApply = (projectRoot, starterRoot, args = [], env = {}) =>
  spawnSync(
    process.execPath,
    [path.join(projectRoot, 'scripts/user/apply.mjs'), ...args, starterRoot],
    {
      env: { ...process.env, EVENTS_DIR: path.join(projectRoot, 'events'), ...env },
      encoding: 'utf8',
    },
  );

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const read = (file) => fs.readFileSync(file, 'utf8');

const exists = (file) => fs.existsSync(file);

afterAll(() => {
  for (const root of scratches) fs.rmSync(root, { recursive: true, force: true });
});

describe('apply.mjs の一方向ミラー', () => {
  it('dry-run は何も変更せず、コピーと削除の計画だけを出力する', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, '.opencode', 'lib', 'a.ts'), '// starter a');
    write(path.join(starter, '.opencode', 'lib', 'b.ts'), '// starter b');
    write(path.join(project, '.opencode', 'lib', 'a.ts'), '// project a (same size)');
    write(path.join(project, '.opencode', 'lib', 'extra.ts'), '// project extra');

    const beforeLib = read(path.join(project, '.opencode', 'lib', 'extra.ts'));
    const result = runApply(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('コピー: .opencode/lib/a.ts');
    expect(result.stdout).toContain('コピー: .opencode/lib/b.ts');
    expect(result.stdout).toContain('削除: .opencode/lib/extra.ts');
    expect(result.stdout).toContain('[dry-run]');
    expect(read(path.join(project, '.opencode', 'lib', 'extra.ts'))).toBe(beforeLib);
    expect(exists(path.join(project, '.opencode', 'lib', 'b.ts'))).toBe(false);
  });

  it('--run はスターターに合わせてコピー・削除する', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, '.opencode', 'lib', 'a.ts'), '// starter a');
    write(path.join(project, '.opencode', 'lib', 'extra.ts'), '// project extra');

    const result = runApply(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(exists(path.join(project, '.opencode', 'lib', 'a.ts'))).toBe(true);
    expect(read(path.join(project, '.opencode', 'lib', 'a.ts'))).toBe('// starter a');
    expect(exists(path.join(project, '.opencode', 'lib', 'extra.ts'))).toBe(false);
  });

  it('コピー後の mtime 保持で再実行は冪等になる', () => {
    const project = makeProject();
    const starter = makeStarter();
    // スターター側だけにあるファイル → 初回でコピーされ、mtime が保持される
    write(path.join(starter, '.opencode', 'lib', 'a.ts'), '// starter a');

    const first = runApply(project, starter, ['--run']);
    expect(first.status).toBe(0);
    expect(exists(path.join(project, '.opencode', 'lib', 'a.ts'))).toBe(true);

    // 初回コピー後は mtime が揃うため、再実行で再コピーされない
    const second = runApply(project, starter, ['--run']);
    expect(second.status).toBe(0);
    expect(second.stdout).not.toContain('コピー: .opencode/lib/a.ts');
  });

  it('除外（node_modules 等）は削除対象にならず保護される', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, '.opencode', 'lib', 'a.ts'), '// starter a');
    // SYNC_UNITS 内のネストにも node_modules があれば保護される（任意深度）
    write(path.join(project, '.opencode', 'lib', 'node_modules', 'pkg', 'x.js'), '// nm');
    write(path.join(project, '.opencode', 'lib', 'extra.ts'), '// project extra');

    const result = runApply(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(exists(path.join(project, '.opencode', 'lib', 'node_modules', 'pkg', 'x.js'))).toBe(
      true,
    );
    expect(exists(path.join(project, '.opencode', 'lib', 'extra.ts'))).toBe(false);
  });

  it('スターターに無い単位ディレクトリはスキップされる', () => {
    const project = makeProject();
    const starter = makeStarter();
    fs.rmSync(path.join(starter, '.opencode', 'agent'), { recursive: true });

    const result = runApply(project, starter);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skip (not found): .opencode/agent');
  });

  it('events の状態ファイル（log.jsonl / checkpoint.json / snapshots/）は削除されない', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, 'events', 'scripts', 'x.mjs'), '// x');
    write(
      path.join(project, 'events', 'log.jsonl'),
      '{"ts":"2026-09-01T00:00:00.000+09:00","type":"set","key":"product.name.value","value":"x"}\n',
    );
    write(path.join(project, 'events', 'checkpoint.json'), '{}\n');
    write(path.join(project, 'events', 'snapshots', 'product.json'), '{}\n');

    const result = runApply(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(exists(path.join(project, 'events', 'log.jsonl'))).toBe(true);
    expect(exists(path.join(project, 'events', 'checkpoint.json'))).toBe(true);
    expect(exists(path.join(project, 'events', 'snapshots', 'product.json'))).toBe(true);
  });

  it('docs 単位は .gitattributes を運ぶ', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, '.gitattributes'), 'events/log.jsonl merge=event-merge-driver\n');
    write(path.join(starter, 'unrelated.txt'), 'starter unrelated');
    write(path.join(project, 'keep.txt'), 'project keep');

    const result = runApply(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(read(path.join(project, '.gitattributes'))).toBe(
      'events/log.jsonl merge=event-merge-driver\n',
    );
    expect(exists(path.join(project, 'unrelated.txt'))).toBe(false);
    expect(read(path.join(project, 'keep.txt'))).toBe('project keep');
  });

  it('存在しないスターターパスは失敗する', () => {
    const project = makeProject();
    const result = runApply(project, '/tmp/definitely-not-exist-12345');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('スターターが見つかりません');
  });

  it('meta はスターターのコミット済み在庫で置換され、ログの committed イベントが除去される', () => {
    const project = makeProject();
    const starter = makeStarter();

    const result = runApply(project, starter, ['--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('スターターのコミット済み在庫');
    expect(result.stdout).toContain(
      '[strip] プロジェクトのログからコミット済み meta イベント 1 件を除去',
    );

    // プロジェクトの checkpoint: meta はスターターのコミット済み在庫（status/updatedAt 除去）で置換
    const checkpoint = JSON.parse(read(path.join(project, 'events', 'checkpoint.json')));
    expect(checkpoint.trees.meta.skills.agenda).toEqual({
      path: '.opencode/skills/agenda/SKILL.md',
      purpose: '作業単位を確定する',
    });
    // スターターのログ由来のコミット済み在庫（audit）も畳み込まれて含まれる
    expect(checkpoint.trees.meta.skills.audit).toEqual({
      path: '.opencode/skills/audit/SKILL.md',
      purpose: 'コミット前レビュー',
    });
    // 非コミット（implement）の recon は在庫に含まれない
    expect(checkpoint.trees.meta.skills.recon).toBeUndefined();
    // product は維持される
    expect(checkpoint.trees.product.name.value).toBe('x');

    // プロジェクトのログ: committed イベント除去後、非コミット + product のみ
    const log = read(path.join(project, 'events', 'log.jsonl'))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    expect(log.map((event) => event.key)).toEqual([
      'meta.skills.recon.status',
      'product.name.value',
    ]);

    // スナップショットが build で再生成される
    const meta = JSON.parse(read(path.join(project, 'events', 'snapshots', 'meta.json')));
    expect(meta.content.skills.agenda.status).toBeUndefined();
    expect(meta.content.skills.recon.status.stage).toBe('implement');
  });

  it('--init は checkpoint 種まき・log 初期化・README 削除・build を一貫して行う', () => {
    const project = makeProject({
      logEvents: [
        {
          ts: '2026-09-01T00:00:00.000+09:00',
          type: 'set',
          key: 'product.name.value',
          value: 'old',
        },
      ],
    });
    const starter = makeStarter();
    write(path.join(project, '.opencode', 'lib', 'x.ts'), '// project stack file');
    write(path.join(project, 'README.md'), '# old');
    write(path.join(project, 'README.ja.md'), '# old ja');

    const result = runApply(project, starter, ['--init', '--run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('init 完了');
    expect(exists(path.join(project, 'README.md'))).toBe(false);
    expect(exists(path.join(project, 'README.ja.md'))).toBe(false);

    // log は name/what の 2 イベントのみ
    const log = read(path.join(project, 'events', 'log.jsonl'))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    expect(log.map((event) => event.key)).toEqual(['product.name.value', 'product.what.value']);
    expect(log[0].value).toBe('プロジェクト名が入ります');

    // checkpoint: product.stack（stripped）+ スターター在庫の meta
    const checkpoint = JSON.parse(read(path.join(project, 'events', 'checkpoint.json')));
    expect(checkpoint.asOf).toBeNull();
    expect(checkpoint.trees.meta.skills.agenda).toEqual({
      path: '.opencode/skills/agenda/SKILL.md',
      purpose: '作業単位を確定する',
    });
    expect(checkpoint.trees.product.name).toBeUndefined();
    expect(checkpoint.trees.product.stack).toBeDefined();
    // stack は status/updatedAt を含まない（stripped）
    expect(checkpoint.trees.product.stack.status).toBeUndefined();
    expect(checkpoint.trees.product.stack.updatedAt).toBeUndefined();

    // build でスナップショットが再生成される（name/what が反映される）
    const product = JSON.parse(read(path.join(project, 'events', 'snapshots', 'product.json')));
    expect(product.content.name.value).toBe('プロジェクト名が入ります');
  });

  it('dry-run は checkpoint / log / README を変更しない', () => {
    const project = makeProject();
    const starter = makeStarter();
    write(path.join(starter, '.opencode', 'lib', 'a.ts'), '// starter a');
    write(path.join(project, 'README.md'), '# old');
    const beforeLog = read(path.join(project, 'events', 'log.jsonl'));
    const beforeCheckpoint = fs.existsSync(path.join(project, 'events', 'checkpoint.json'))
      ? read(path.join(project, 'events', 'checkpoint.json'))
      : null;

    const result = runApply(project, starter, ['--init']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run]');
    expect(read(path.join(project, 'events', 'log.jsonl'))).toBe(beforeLog);
    const checkpointExists = fs.existsSync(path.join(project, 'events', 'checkpoint.json'));
    expect(checkpointExists ? read(path.join(project, 'events', 'checkpoint.json')) : null).toBe(
      beforeCheckpoint,
    );
    expect(exists(path.join(project, 'README.md'))).toBe(true);
    expect(exists(path.join(project, '.opencode', 'lib', 'a.ts'))).toBe(false);
  });
});
