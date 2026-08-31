// 導出・抽出。スナップショット書き出しと未確定作業単位の列挙
import { NAMESPACES, UNRESOLVED_STAGES } from './consts.mjs';

const sortValue = (value) => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, sortValue(value[k])]),
    );
  }
  return value;
};

export const stableStringify = (value) => JSON.stringify(sortValue(value));

// 未確定コンポーネント（作業単位）の抽出。status.stage が ready/implement のままのものを全名前空間（product/meta）から取り出す。コミット時の未確定フォローアップに使う。
// 第3セグメント以下が作業単位で、status.stage を持つノードを対象にする
export const findUnresolved = (trees) => {
  const found = [];
  const walk = (container, prefix) => {
    for (const [key, node] of Object.entries(container ?? {})) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      const keyPath = `${prefix}.${key}`;
      if (typeof node.status?.stage === 'string' && UNRESOLVED_STAGES.has(node.status.stage)) {
        found.push({
          name: keyPath,
          stage: node.status.stage,
          text: typeof node.status.text === 'string' ? node.status.text : '',
          path: typeof node.path === 'string' ? node.path : '',
        });
      }
      walk(node, keyPath);
    }
  };
  for (const ns of Object.keys(NAMESPACES).filter((k) => NAMESPACES[k].fold)) {
    walk(trees[ns], ns);
  }
  return found;
};
