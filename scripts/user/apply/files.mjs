// スターター → プロジェクトの一方向ファイルミラー（純 Node 実装）。
// 指定単位（SYNC_UNITS）ごとに再帰走査し、mtime/size 比較でコピー／削除を判定する。
// rclone / rsync 等の外部ツールには依存しない。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { groupsFor } from '../groups.mjs';
import { COMMON_SKIPS, isSkippedPath } from '../match.mjs';

// プロジェクトルートは EVENTS_DIR から遅延解決する（テストでスクラッチを指せるようにするため）。
// スクリプト実在位置（process.argv[1]）からは解決しない — 実リポジトリを破壊しないため。
// EVENTS_DIR 未設定時、このファイルは <root>/scripts/user/apply/files.mjs にあるので
// 3階層上がプロジェクトルートそのもの（末尾に '..' を足して親を返さないこと）。
export const PROJECT_ROOT = () => {
  if (process.env.EVENTS_DIR) return path.resolve(process.env.EVENTS_DIR, '..');
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
};

// 同期単位はグループ定義ファイル（../groups.mjs）が正本。apply が対象にするのは
// tools に 'apply' を含むグループ。項目の意味は定義ファイルのコメントを参照
export const SYNC_UNITS = groupsFor('apply');

// ディレクトリ単位に適用する共通除外。lock は生成物なので運ばない（中身は match.mjs の共有表と同一）
export const COMMON_EXCLUDES = COMMON_SKIPS;

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

// 除外判定は match.mjs の共有を使う。パターンは2種:
// - 素形（スラッシュ無し。node_modules/・.DS_Store 等）: 従来通り、任意深度のセグメント一致
// - 単位相対（スラッシュ有り。mockup/workbench/dist/ 等）: 単位起点の相対パスで判定。
//   末尾 '/' は配下すべて、'*' は同一セグメント内のワイルドカード、素の相対パスはその1ファイル
// 単位相対の約束は new の scaffold 複写と共有する（純粋判定は match.mjs が正本）
const isExcluded = (relPath, unitExcludes = []) => isSkippedPath(relPath, unitExcludes);

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
    // excludesApply は apply 時のみ足す（new の種に要るものはここで免除する。groups.mjs の注記参照）
    const unitExcludes = [...(unit.excludes ?? []), ...(unit.excludesApply ?? [])];
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
