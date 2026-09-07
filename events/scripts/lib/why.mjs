// sibling `.why` リーフの検証と投影。短形式の展開・値の検証・位置の検証・why.json 向けの抽出と除外を担う
// 仕様は events/README.md（Recording contract の why 節）を参照
import { EventError } from './util.mjs';
import { FACT_SECTIONS, META_SECTIONS, WHY_LEAF_ORDER } from './consts.mjs';

// エントリ ID 文法：`YYYYMMDDTHHmmssSSS`（辞書順＝時系列順）。ドットを含めない
export const WHY_ENTRY_ID = /^\d{8}T\d{9}$/;

// 採番済み ts（JST ISO 8601）からエントリ ID を導く
export const idFromTs = (ts) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})[+-]\d{2}:\d{2}$/.exec(
    ts,
  );
  if (!match) throw new EventError(`cannot derive a why entry id from ts: ${ts}`);
  const [, y, mo, d, h, mi, s, ms] = match;
  return `${y}${mo}${d}T${h}${mi}${s}${ms}`;
};

const whyTargetOf = (key) => {
  if (key.endsWith('.whyNot')) return key.slice(0, -'.whyNot'.length);
  if (key.endsWith('.why')) return key.slice(0, -'.why'.length);
  return null;
};

// 短形式の why/whyNot 指定をエントリ単位キーへ展開する。同一 invocation・同一対象の
// `.why`＋`.whyNot` は 1 エントリに束ねる（共有 ts から同一 ID を導く）。単独 whyNot・
// 重複指定は拒否し、整形不能な値はそのまま通して buildEvent 側で拒否させる
export const expandWhyOps = (drafts, ts) => {
  const id = idFromTs(ts);
  const groups = new Map();
  const out = [];
  for (const draft of drafts) {
    if (draft.type !== 'set' || typeof draft.key !== 'string') {
      out.push(draft);
      continue;
    }
    const target = whyTargetOf(draft.key);
    if (target === null) {
      out.push(draft);
      continue;
    }
    if (typeof draft.value !== 'string' || draft.value === '') {
      out.push(draft);
      continue;
    }
    const isWhy = draft.key.endsWith('.why');
    if (!groups.has(target)) {
      const slot = out.length;
      groups.set(target, { slot });
      out.push(null);
    }
    const group = groups.get(target);
    if (isWhy) {
      if (group.why !== undefined) {
        throw new EventError(`duplicate why in one invocation: ${draft.key}`);
      }
      group.why = draft.value;
    } else {
      if (group.whyNot !== undefined) {
        throw new EventError(`duplicate whyNot in one invocation: ${draft.key}`);
      }
      group.whyNot = draft.value;
    }
  }
  for (const [target, group] of groups) {
    if (group.why === undefined) {
      throw new EventError(`whyNot without why in one invocation: ${target}.whyNot`);
    }
    const value =
      group.whyNot === undefined ? { why: group.why } : { why: group.why, whyNot: group.whyNot };
    out[group.slot] = { type: 'set', key: `${target}.why.${id}`, value };
  }
  return out;
};

// `.why` / `.whyNot` の短形式の値：理由テキストの素文字列のみ。旧オブジェクト形状は拒否する
export const assertWhyShortValue = (key, value) => {
  if (typeof value !== 'string' || value === '') {
    throw new EventError(`why must be a non-empty reason string: ${key}`);
  }
};

// `.why.<ID>` エントリキーの位置規則：対象は `.why` と同じ場所、ID はエントリ文法のみ
export const assertWhyEntryLocation = (key) => {
  const parts = key.split('.');
  if (parts.at(-2) !== 'why' || !WHY_ENTRY_ID.test(parts.at(-1) ?? '')) {
    throw new EventError(`why entry key must be <target>.why.<YYYYMMDDTHHmmssSSS>: ${key}`);
  }
  assertWhyLocation(parts.slice(0, -1).join('.'));
};

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
// キーは対象ノードのドットパス（例：`product.stack`）、値は ID キー付きエントリ群。
// ID の辞書順＝時系列順なので整列し直す必要はないが、安定のため明示する
export const projectWhy = (trees) => {
  const found = {};
  const walk = (node, prefix) => {
    for (const [key, child] of Object.entries(node ?? {})) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) {
        continue;
      }
      const childPath = prefix === '' ? key : `${prefix}.${key}`;
      if (key === 'why') {
        found[prefix] = Object.fromEntries(
          Object.keys(child)
            .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            .map((id) => [id, sortWhyLeaf(child[id])]),
        );
        continue;
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
