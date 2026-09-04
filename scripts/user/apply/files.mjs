// スターター → プロジェクトの一方向ファイルミラー（純 Node 実装）。
// 指定単位（SYNC_UNITS）ごとに再帰走査し、mtime/size 比較でコピー／削除を判定する。
// rclone / rsync 等の外部ツールには依存しない。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// プロジェクトルートは EVENTS_DIR から遅延解決する（テストでスクラッチを指せるようにするため）。
// スクリプト実在位置（process.argv[1]）からは解決しない — 実リポジトリを破壊しないため。
export const PROJECT_ROOT = () => {
  const eventsDir =
    process.env.EVENTS_DIR ??
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  return path.resolve(eventsDir, '..');
};

// 同期単位。`files` があれば allowlist（そのファイルのみ）、なければディレクトリ丸ごと同期。
// `excludes` は「同期対象外」で、削除からも保護される（node_modules 等）
export const SYNC_UNITS = [
  { label: 'harness', paths: ['.opencode/lib', '.opencode/plugin'] },
  { label: 'agents', paths: ['.opencode/agent'] },
  { label: 'skills', paths: ['.opencode/skills'] },
  {
    label: 'config',
    paths: ['.opencode'],
    files: ['tsconfig.json', 'package.json', '.gitignore'],
  },
  { label: 'scripts', paths: ['scripts'] },
  {
    label: 'events',
    paths: ['events'],
    excludes: ['log.jsonl', 'checkpoint.json', 'snapshots/'],
  },
  { label: 'docs', paths: ['.'], files: ['AGENTS.md', 'lefthook.yaml', '.gitattributes'] },
];

// ディレクトリ単位に適用する共通除外。lock は生成物なので運ばない
export const COMMON_EXCLUDES = [
  'node_modules/',
  '.DS_Store',
  'package-lock.json',
  'pnpm-lock.yaml',
];

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const stat = (file) => {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
};

// 除外判定。ディレクトリパターン（node_modules/ 等）は任意深度のセグメント接頭辞一致、
// ファイルパターン（.DS_Store 等）は任意セグメントの basename 一致
const isExcluded = (relPath, unitExcludes = []) => {
  const patterns = [...COMMON_EXCLUDES, ...unitExcludes];
  const segments = relPath.split('/');
  return patterns.some((pattern) => {
    if (pattern.endsWith('/')) {
      // ディレクトリパターン: いずれかのセグメント位置から一致（node_modules/ 等）
      const dir = pattern.slice(0, -1);
      return segments.includes(dir);
    }
    // basename パターン: いずれかのセグメントと一致（.DS_Store 等）
    return segments.includes(pattern);
  });
};

// 再帰走査して相対パス一覧を返す（dir 起点。空ディレクトリは含まない。dir が無ければ空）
const walk = (dir, base = dir, unitExcludes = []) => {
  const entries = [];
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    // 存在しないディレクトリは空として扱う。それ以外の I/O エラーは黙殺しない
    if (error.code === 'ENOENT') return entries;
    throw error;
  }
  for (const entry of list) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    if (isExcluded(rel, unitExcludes)) continue;
    if (entry.isDirectory()) entries.push(...walk(abs, base, unitExcludes));
    else entries.push(rel);
  }
  return entries;
};

// mtime/size 比較。utimesSync は秒精度のため、mtime は秒に丸めて比較する（ms 差による恒久再コピーを防ぐ）
const sameFile = (a, b) =>
  a !== null &&
  b !== null &&
  Math.floor(a.mtimeMs / 1000) === Math.floor(b.mtimeMs / 1000) &&
  a.size === b.size;

// 一つの同期単位を処理する。dry-run なら計画のみ表示
const applyUnit = (unit, starterRoot, run, changes) => {
  for (const unitPath of unit.paths) {
    const src = path.join(starterRoot, unitPath);
    const dst = path.join(PROJECT_ROOT(), unitPath);

    // files allowlist: 指定ファイルのみを対象にする
    if (unit.files) {
      for (const file of unit.files) {
        const srcFile = path.join(src, file);
        const dstFile = path.join(dst, file);
        const srcStat = stat(srcFile);
        const dstStat = stat(dstFile);
        if (!srcStat) {
          if (dstStat) {
            changes.push(`削除: ${unitPath}/${file}`);
            if (run) fs.rmSync(dstFile);
          }
          continue;
        }
        if (!sameFile(srcStat, dstStat)) {
          changes.push(`コピー: ${unitPath}/${file}`);
          if (run) {
            fs.mkdirSync(path.dirname(dstFile), { recursive: true });
            fs.copyFileSync(srcFile, dstFile);
            fs.utimesSync(dstFile, srcStat.atime, srcStat.mtime);
          }
        }
      }
      continue;
    }

    // ディレクトリ丸ごと: 再帰比較
    if (!fs.existsSync(src)) {
      console.log(`skip (not found): ${unitPath}`);
      continue;
    }
    const unitExcludes = unit.excludes ?? [];
    const srcFiles = walk(src, src, unitExcludes);
    const dstFiles = walk(dst, dst, unitExcludes);

    // コピー（新規・差異）
    for (const rel of srcFiles) {
      const srcFile = path.join(src, rel);
      const dstFile = path.join(dst, rel);
      const srcStat = stat(srcFile);
      // 走査後に src が消えた場合（競合削除）は計画にも載せない
      if (!srcStat) continue;
      if (!sameFile(srcStat, stat(dstFile))) {
        changes.push(`コピー: ${unitPath}/${rel}`);
        if (run) {
          fs.mkdirSync(path.dirname(dstFile), { recursive: true });
          fs.copyFileSync(srcFile, dstFile);
          fs.utimesSync(dstFile, srcStat.atime, srcStat.mtime);
        }
      }
    }

    // 削除（スターターに無いプロジェクト側ファイル）
    for (const rel of dstFiles) {
      if (!srcFiles.includes(rel)) {
        const dstFile = path.join(dst, rel);
        changes.push(`削除: ${unitPath}/${rel}`);
        if (run) fs.rmSync(dstFile);
      }
    }
  }
};

// スターター → プロジェクトへ一方向ミラーする
export const applyFiles = (starterRoot, run) => {
  const changes = [];
  for (const unit of SYNC_UNITS) applyUnit(unit, starterRoot, run, changes);
  return changes;
};
