// 導出・抽出。スナップショット書き出しと未確定作業単位の列挙
import {
  DEPLOY_ORDER,
  FACT_LEAF_ORDER,
  FEATURE_LEAF_ORDER,
  LOOK_ORDER,
  META_COMPONENT_ORDER,
  META_ORDER,
  NAMESPACES,
  PRODUCT_ORDER,
  ROADMAP_ORDER,
  STACK_ORDER,
  STATUS_ORDER,
  UNRESOLVED_STAGES,
} from './consts.mjs';

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

// 書き出し整形（骨格は任意順、中身は自動整列）。配列の中身は並べ替えず、要素のみ再帰整形する
// 未知キーは末尾にアルファベット順で足す。入力は変えず新しいオブジェクトを返す
const orderedEntries = (obj, order) => {
  const rank = new Map(order.map((key, index) => [key, index]));
  return Object.entries(obj).toSorted(([a], [b]) => {
    const ra = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY;
    const rb = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
};

const sortAlphabetical = (value) => {
  if (Array.isArray(value)) return value.map(sortAlphabetical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => [key, sortAlphabetical(value[key])]),
    );
  }
  return value;
};

const sortStatus = (status) => {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return status;
  return Object.fromEntries(
    orderedEntries(status, STATUS_ORDER).map(([key, child]) => [key, sortAlphabetical(child)]),
  );
};

const sortFeatureLeaf = (leaf) => {
  if (!leaf || typeof leaf !== 'object' || Array.isArray(leaf)) return leaf;
  return Object.fromEntries(
    orderedEntries(leaf, FEATURE_LEAF_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      if (Array.isArray(child)) return [key, child.map(sortAlphabetical)];
      return [key, sortAlphabetical(child)];
    }),
  );
};

const sortStack = (stack) => {
  if (!stack || typeof stack !== 'object' || Array.isArray(stack)) return stack;
  return Object.fromEntries(
    orderedEntries(stack, STACK_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      return [key, sortAlphabetical(child)];
    }),
  );
};

const sortLook = (look) => {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return look;
  return Object.fromEntries(
    orderedEntries(look, LOOK_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      return [key, sortAlphabetical(child)];
    }),
  );
};

const sortFactLeaf = (leaf) =>
  Object.fromEntries(
    orderedEntries(leaf, FACT_LEAF_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      return [key, sortAlphabetical(child)];
    }),
  );

const sortRoadmap = (roadmap) => {
  if (!roadmap || typeof roadmap !== 'object' || Array.isArray(roadmap)) return roadmap;
  return Object.fromEntries(
    orderedEntries(roadmap, ROADMAP_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      if (Array.isArray(child)) return [key, [...child]];
      return [key, sortAlphabetical(child)];
    }),
  );
};

const sortDeploy = (deploy) => {
  if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) return deploy;
  return Object.fromEntries(
    orderedEntries(deploy, DEPLOY_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      return [key, sortAlphabetical(child)];
    }),
  );
};

const sortProduct = (product) => {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return {};
  return Object.fromEntries(
    orderedEntries(product, PRODUCT_ORDER).map(([section, child]) => {
      if (!child || typeof child !== 'object' || Array.isArray(child)) return [section, child];
      switch (section) {
        case 'stack':
          return [section, sortStack(child)];
        case 'look':
          return [section, sortLook(child)];
        case 'features':
          return [
            section,
            Object.fromEntries(
              Object.keys(child)
                .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
                .map((id) => [id, sortFeatureLeaf(child[id])]),
            ),
          ];
        case 'roadmap':
          return [section, sortRoadmap(child)];
        case 'deploy':
          return [section, sortDeploy(child)];
        default:
          return [section, sortFactLeaf(child)];
      }
    }),
  );
};

const isMetaComponent = (node) =>
  node &&
  typeof node === 'object' &&
  !Array.isArray(node) &&
  ('purpose' in node || 'status' in node || 'path' in node);

const sortMetaComponent = (component) =>
  Object.fromEntries(
    orderedEntries(component, META_COMPONENT_ORDER).map(([key, child]) => {
      if (key === 'status') return [key, sortStatus(child)];
      return [key, sortAlphabetical(child)];
    }),
  );

const sortMetaContainer = (container) => {
  if (!container || typeof container !== 'object' || Array.isArray(container)) return container;
  return Object.fromEntries(
    Object.keys(container)
      .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((key) => {
        const child = container[key];
        if (isMetaComponent(child)) return [key, sortMetaComponent(child)];
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          return [key, sortMetaContainer(child)];
        }
        return [key, child];
      }),
  );
};

const sortMeta = (meta) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return Object.fromEntries(
    orderedEntries(meta, META_ORDER).map(([section, container]) => [
      section,
      sortMetaContainer(container),
    ]),
  );
};

// checkpoint 合算の見た目：product 定義と meta 定義をそれぞれ適用した結果
export const sortTrees = (trees) => ({
  product: sortProduct(trees?.product),
  meta: sortMeta(trees?.meta),
});

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
