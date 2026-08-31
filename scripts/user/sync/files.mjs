import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const PROJECT_ROOT = path.resolve(path.dirname(process.argv[1]), '../..');

export const SYNC_UNITS = [
  { label: 'harness', paths: ['.opencode/lib', '.opencode/plugin'] },
  { label: 'agents', paths: ['.opencode/agent'] },
  { label: 'skills', paths: ['.opencode/skills'] },
  {
    label: 'config',
    paths: ['.opencode'],
    filter: ['+ tsconfig.json', '+ package.json', '+ .gitignore', '- *'],
  },
  { label: 'scripts', paths: ['scripts'] },
  {
    label: 'events',
    paths: ['events'],
    excludes: ['log.jsonl', 'checkpoint.json', 'snapshots/**'],
  },
  { label: 'docs', paths: ['.'], filter: ['+ AGENTS.md', '+ lefthook.yaml', '- *'] },
];

export const COMMON_EXCLUDES = [
  'node_modules/**',
  '**/.DS_Store',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
];

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

export const checkRclone = () => {
  const probe = spawnSync('rclone', ['version'], { encoding: 'utf8' });
  if (probe.error) fail('rclone が見つかりません。インストールしてから実行してください');
};

const bisyncArgs = (unit, src, dst, preview) => {
  const args = ['bisync', src, dst];
  if (unit.filter) for (const pattern of unit.filter) args.push('--filter', pattern);
  else {
    for (const pattern of COMMON_EXCLUDES) args.push('--exclude', pattern);
    for (const pattern of unit.excludes ?? []) args.push('--exclude', pattern);
  }
  if (preview) args.push('--dry-run');
  return args;
};

const runBisync = (unit, src, dst, preview) => {
  const baseArgs = bisyncArgs(unit, src, dst, preview);
  const first = spawnSync('rclone', baseArgs, { encoding: 'utf8' });
  const output = first.stdout + first.stderr;
  if (first.status === 0) return { ok: true, output };
  if (output.includes('Must run --resync')) {
    const retry = spawnSync('rclone', [...baseArgs, '--resync', '--resync-mode', 'newer'], {
      encoding: 'utf8',
    });
    return { ok: retry.status === 0, output: retry.stdout + retry.stderr };
  }
  return { ok: false, output };
};

export const syncFiles = (starterRoot, run) => {
  let failed = false;
  for (const unit of SYNC_UNITS) {
    for (const unitPath of unit.paths) {
      const src = path.join(PROJECT_ROOT, unitPath);
      const dst = path.join(starterRoot, unitPath);
      if (!fs.existsSync(src) || !fs.existsSync(dst)) {
        console.log(`skip (not found): ${unitPath}`);
        continue;
      }
      const result = runBisync(unit, src, dst, !run);
      process.stdout.write(result.output);
      if (!result.ok) failed = true;
    }
  }
  return !failed;
};
