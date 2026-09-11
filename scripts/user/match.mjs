// apply / new で共有する除外パターンの純粋判定。素形（スラッシュ無し）は任意深度の
// セグメント一致、単位相対（スラッシュ有り）は単位起点の相対パスで判定する。
// 末尾 '/' は配下すべて、'*' は同一セグメント内のワイルドカード、素の相対パスはその1ファイル
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const hasInnerSlash = (pattern) => pattern.replace(/\/$/, '').includes('/');

export const matchScoped = (rel, pattern) => {
  if (pattern.endsWith('/')) {
    const dir = pattern.slice(0, -1);
    return rel === dir || rel.startsWith(`${dir}/`);
  }
  if (!pattern.includes('*')) return rel === pattern;
  // '*' は '/' を跨がない
  const source = pattern
    .split('/')
    .map((segment) => segment.split('*').map(escapeRegExp).join('[^/]*'))
    .join('/');
  return new RegExp(`^${source}$`).test(rel);
};

// apply / new で共有する除外スキップ表と純粋判定。素形（スラッシュ無し）は任意深度の
// セグメント一致、単位相対（スラッシュ有り）は単位起点の相対パスで判定する
export const COMMON_SKIPS = ['node_modules/', '.DS_Store', 'package-lock.json', 'pnpm-lock.yaml'];

export const isSkippedPath = (rel, extra = []) => {
  const segments = rel.split('/');
  return [...COMMON_SKIPS, ...extra].some((pattern) => {
    if (!hasInnerSlash(pattern)) {
      if (pattern.endsWith('/')) return segments.includes(pattern.slice(0, -1));
      return segments.includes(pattern);
    }
    return matchScoped(rel, pattern);
  });
};
