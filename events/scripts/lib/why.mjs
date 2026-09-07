// sibling `.why` リーフの検証と投影。値の検証・位置の検証・why.json 向けの抽出と除外を担う
// 仕様は events/README.md（Recording contract の why 節）を参照
import { EventError } from './util.mjs';
import { FACT_SECTIONS, META_SECTIONS, WHY_LEAF_ORDER } from './consts.mjs';

// `.why` を書ける位置は `.status` と同じ：fact セクション直下か作業単位のみ。
// それ以外の位置・深さはここで拒否する
export const assertWhyLocation = (key) => {
  const parts = key.split('.');
  const parent = parts.slice(0, -1);
  const isWorkUnit =
    parent.length === 3 &&
    ((parent[0] === 'product' && parent[1] === 'features') ||
      (parent[0] === 'meta' && META_SECTIONS.has(parent[1])));
  const isFactSection =
    parent.length === 2 && parent[0] === 'product' && FACT_SECTIONS.has(parent[1]);
  if (!isWorkUnit && !isFactSection) {
    throw new EventError(`why is only allowed on fact sections or work units: ${key}`);
  }
};

// `.why` リーフの値形状：`why` 必須・`whyNot` 任意、それ以外は持たせない
export const assertWhyValue = (key, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventError(`why must be an object: ${key}`);
  }
  const keys = Object.keys(value).toSorted();
  if (keys.length === 0 || keys[0] !== 'why' || keys.some((k) => k !== 'why' && k !== 'whyNot')) {
    throw new EventError(`why requires exactly {why} with optional whyNot: ${key}`);
  }
  if (typeof value.why !== 'string' || value.why === '') {
    throw new EventError(`why.why must be a non-empty string: ${key}`);
  }
  if (value.whyNot !== undefined && (typeof value.whyNot !== 'string' || value.whyNot === '')) {
    throw new EventError(`why.whyNot must be a non-empty string when present: ${key}`);
  }
};

const sortWhyLeaf = (leaf) => {
  const rank = new Map(WHY_LEAF_ORDER.map((key, index) => [key, index]));
  return Object.fromEntries(
    Object.entries(leaf).toSorted(([a], [b]) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99)),
  );
};

// 畳み込み済みツリーから `.why` を集め、`why.json` 向けの投影を作る。
// キーは対象ノードのドットパス（例：`product.stack`）、値は why リーフ。対象パス順に整列する
export const projectWhy = (trees) => {
  const found = {};
  const walk = (node, prefix) => {
    for (const [key, child] of Object.entries(node ?? {})) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const childPath = prefix === '' ? key : `${prefix}.${key}`;
      if (Object.hasOwn(child, 'why') && child.why && typeof child.why === 'object') {
        found[childPath] = sortWhyLeaf(child.why);
      }
      walk(child, childPath);
    }
  };
  walk(trees?.product, 'product');
  walk(trees?.meta, 'meta');
  return Object.fromEntries(
    Object.keys(found)
      .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => [key, found[key]]),
  );
};

// スナップショット書き出し用にツリーから `.why` を取り除く。入力は変えず新しい値を返す
export const stripWhy = (value) => {
  if (Array.isArray(value)) return value.map(stripWhy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'why')
        .map(([key, child]) => [key, stripWhy(child)]),
    );
  }
  return value;
};
