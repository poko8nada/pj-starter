// 畳み込み（fold）の純粋ロジック。チェックポイント + ログ → 現在ツリーの構築
import { EventError } from './util.mjs';
import { NAMESPACES, STAGES } from './consts.mjs';
import { loadBase, readEvents } from './state.mjs';

export function setPath(tree, key, value) {
  const parts = key.split('.');
  let node = tree;
  for (const part of parts.slice(0, -1)) {
    if (node[part] === null || typeof node[part] !== 'object' || Array.isArray(node[part])) {
      node[part] = {};
    }
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

const pruneEmpty = (tree, parts) => {
  for (let depth = parts.length; depth > 1; depth--) {
    const chain = parts.slice(0, depth);
    let node = tree;
    for (const part of chain.slice(0, -1)) node = node[part];
    const last = chain.at(-1);
    if (node && typeof node[last] === 'object' && Object.keys(node[last]).length === 0) {
      delete node[last];
    } else return;
  }
};

// ドットパスの葉を削除し、空になった親を枝刈りする。
// 名前空間の第1セグメントは常に保持する（fold の不変条件）
export function deletePath(tree, key) {
  const parts = key.split('.');
  let node = tree;
  for (const part of parts.slice(0, -1)) {
    if (node === null || typeof node[part] !== 'object') return;
    node = node[part];
  }
  delete node[parts.at(-1)];
  pruneEmpty(tree, parts.slice(0, -1));
}

const workUnits = (container, marker) =>
  Object.values(container ?? {}).filter(
    (node) => node && typeof node === 'object' && !Array.isArray(node) && marker in node,
  );

export const normalizeTrees = (trees) => {
  for (const node of workUnits(trees.product?.features, 'trigger')) {
    if (!node.status || typeof node.status !== 'object' || Array.isArray(node.status)) {
      node.status = {};
    }
    node.status.stage ??= 'planned';
    node.status.text ??= '未着手';
    if (!STAGES.has(node.status.stage)) throw new EventError(`invalid stage: ${node.status.stage}`);
  }
};

export const injectUpdatedAt = (trees, events) => {
  const stamp = (node, prefix) => {
    let latest = '';
    for (const event of events) {
      if (event.type !== 'set') continue;
      if ((event.key === prefix || event.key.startsWith(`${prefix}.`)) && event.ts > latest) {
        latest = event.ts;
      }
    }
    if (latest) node.updatedAt = latest.slice(0, 10).replaceAll('-', '');
  };
  // status を持たないコンテナはさらに下位へ走査し、持つノードで止まる
  const walk = (node, prefix) => {
    for (const [key, child] of Object.entries(node)) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const childPath = `${prefix}.${key}`;
      if ('status' in child) stamp(child, childPath);
      else walk(child, childPath);
    }
  };
  for (const ns of Object.keys(NAMESPACES).filter((k) => NAMESPACES[k].fold)) {
    trees[ns] ??= {};
    walk(trees[ns], ns);
  }
};

export const applyFoldable = (trees, events) => {
  for (const event of events) {
    const [ns, ...rest] = event.key.split('.');
    if (!NAMESPACES[ns]?.fold) continue;
    if (event.type === 'set') setPath(trees[ns], rest.join('.'), event.value);
    else deletePath(trees[ns], rest.join('.'));
  }
};

// asOf 起算は fold 参加イベントのみ。log の追記でスナップショットが古く見えないようにする
export const lastFoldedTs = (events) =>
  events.findLast((event) => NAMESPACES[event.key.split('.')[0]]?.fold)?.ts ?? '';

export const foldAll = () => {
  const base = loadBase();
  const events = readEvents();
  applyFoldable(base.trees, events);
  const lastEventTs = lastFoldedTs(events);
  const asOf =
    base.compactedAt !== null && base.compactedAt >= lastEventTs
      ? base.compactedAt
      : lastEventTs || null;
  return { trees: base.trees, asOf, events };
};

// 畳み込み状態に対する meta 整合性チェック。実装が進んでいる (ready/implement/commit) のにpath を持たないコンポーネントを検出する（旧 auditMeta の検証を events 側に統合したもの）
const PATH_STAGES = new Set(['ready', 'implement', 'commit']);

export const auditMetaIntegrity = (trees) => {
  if (!trees || typeof trees !== 'object') return [];
  const findings = [];
  const walk = (container, prefix) => {
    for (const [key, node] of Object.entries(container ?? {})) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
      const keyPath = `${prefix}.${key}`;
      if ('purpose' in node) {
        const stage = node.status?.stage;
        if (PATH_STAGES.has(stage) && (typeof node.path !== 'string' || node.path === '')) {
          findings.push(`meta component ${keyPath} is "${stage}" but has no path`);
        }
      }
      walk(node, keyPath);
    }
  };
  walk(trees.meta, 'meta');
  return findings;
};
