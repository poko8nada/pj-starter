// パス判定の共有ユーティリティ。
// isOutsideRoot はプロジェクトルート外のファイル編集を判定する汎用ヘルパで、ゲート（edit-gate）以外のコンポーネントからも利用できる
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// ~ と ~/ をホームディレクトリへ展開する（~user 形式は対象外）
const expandHome = (filePath: string): string =>
  filePath === '~'
    ? homedir()
    : filePath.startsWith('~/')
      ? join(homedir(), filePath.slice(2))
      : filePath;

// プロジェクトルート外のパスかどうか。
// path.relative の厳密判定で /project と /project-other を区別し、~ と ~/ はホーム展開する（~user 形式は対象外）。非文字列・空はルート内扱い
export const isOutsideRoot = (root: string | undefined, filePath: unknown): boolean => {
  if (root === undefined || typeof filePath !== 'string' || filePath === '') return false;
  const rel = relative(root, resolve(root, expandHome(filePath)));
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
};

// ルート配下のパスを相対パスへ変換する（~ と ~/ はホーム展開、~user は対象外）。
// ルート外・非文字列・空・ルート自身・root 未定義は null（記録対象外）
export const toRootRelative = (root: string | undefined, filePath: unknown): string | null => {
  if (root === undefined || typeof filePath !== 'string' || filePath === '') return null;
  if (isOutsideRoot(root, filePath)) return null;
  const rel = relative(root, resolve(root, expandHome(filePath)));
  return rel === '' ? null : rel;
};
