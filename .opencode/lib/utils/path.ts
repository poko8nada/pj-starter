// パス判定の共有ユーティリティ。
// isOutsideRoot はプロジェクトルート外のファイル編集を判定する汎用ヘルパで、ゲート（edit-gate）以外のコンポーネントからも利用できる
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// プロジェクトルート外のパスかどうか。
// path.relative の厳密判定で /project と /project-other を区別し、~ と ~/ はホーム展開する（~user 形式は対象外）。非文字列・空はルート内扱い
export const isOutsideRoot = (root: string | undefined, filePath: unknown): boolean => {
  if (root === undefined || typeof filePath !== 'string' || filePath === '') return false;
  const expanded =
    filePath === '~'
      ? homedir()
      : filePath.startsWith('~/')
        ? join(homedir(), filePath.slice(2))
        : filePath;
  const rel = relative(root, resolve(root, expanded));
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
};
