// events/ 駆動システムの共有ライブラリ。append / build / compact に加え、reset / sync-to-starter のベースライン生成（stripHistory / writeCheckpoint）でも使われる
// 詳細な仕様は events/README.md を参照
// WARNING: このファイルは node: 組み込みモジュールののみを import する設計になっている。
// sync-to-starter.mjs が EVENTS_DIR を差し替えて動的 import（キャッシュ破棄）で再読み込みするため、外部モジュールに分割するとキャッシュが効いて EVENTS_DIR が切り替わらなくなる。
// 分割が必要な場合は sync-to-starter.mjs の loadLib も合わせて修正すること。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const EVENTS_DIR =
  process.env.EVENTS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOG_PATH = path.join(EVENTS_DIR, 'log.jsonl');
export const SNAPSHOTS_DIR = path.join(EVENTS_DIR, 'snapshots');
export const CHECKPOINT_PATH = path.join(EVENTS_DIR, 'checkpoint.json');

// 名前空間ごとの振る舞い宣言。fold:true の名前空間だけがスナップショットに畳み込まれ、asOf 起算の対象になる。log は機械注入の痕跡専用で、build/compact の対象外
export const NAMESPACES = {
  product: { fold: true },
  meta: { fold: true },
  log: { fold: false },
};
export const PRODUCT_SECTIONS = new Set([
  'name',
  'what',
  'stack',
  'look',
  'features',
  'roadmap',
  'deploy',
]);
export const FACT_SECTIONS = new Set(['name', 'what', 'stack', 'look', 'roadmap', 'deploy']);
export const META_SECTIONS = new Set(['harness', 'agents', 'skills', 'docs', 'scripts']);
export const EVENT_TYPES = new Set(['set', 'del']);
export const STAGES = new Set(['planned', 'ready', 'implement', 'commit']);

export const LOG_TOOLS = new Set([
  'read',
  'edit',
  'write',
  'skill',
  'bash',
  'websearch',
  'webfetch',
  'task',
]);

export const jstNow = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

export const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--')) fail(`unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
};

export const parseValue = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export class EventError extends Error {}

// .status の書ける位置は「事実セクションのルート」か「作業単位（第3セグメント）」のみ。
// それ以外の位置・深さはここで拒否する
const assertStatusLocation = (key) => {
  const parts = key.split('.');
  const isWorkUnit =
    parts.length === 4 &&
    ((parts[0] === 'product' && parts[1] === 'features') ||
      (parts[0] === 'meta' && META_SECTIONS.has(parts[1])));
  const isFactSection = parts.length === 3 && parts[0] === 'product' && FACT_SECTIONS.has(parts[1]);
  if (!isWorkUnit && !isFactSection) {
    throw new EventError(`status is only allowed on fact sections or work units: ${key}`);
  }
};

// キーは「名前空間.区画. ...」のドットパス。status の部分書き込み（.status.stage 等）は常に拒否し、status は丸ごと主張させる
export const validateKey = (key) => {
  if (!key) throw new EventError('key is required');
  if (key.includes('.status.')) throw new EventError(`status must be asserted whole: ${key}`);
  const [ns, section] = key.split('.');
  if (!Object.hasOwn(NAMESPACES, ns)) throw new EventError(`unknown namespace: ${ns}`);
  if (ns === 'product' && !PRODUCT_SECTIONS.has(section)) {
    throw new EventError(
      `product section must be one of ${[...PRODUCT_SECTIONS].join('/')}: ${key}`,
    );
  }
  if (ns === 'meta' && !META_SECTIONS.has(section)) {
    throw new EventError(`meta section must be one of ${[...META_SECTIONS].join('/')}: ${key}`);
  }
  if (ns === 'log') {
    const parts = key.split('.');
    if (parts.length !== 3 || parts[1] !== 'try' || parts[2] === '') {
      throw new EventError(`log key must be log.try.<id>: ${key}`);
    }
  }
  if (key.endsWith('.status')) assertStatusLocation(key);
};

const assertStatusValue = (key, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventError(`status must be an object: ${key}`);
  }
  const keys = Object.keys(value).toSorted().join(',');
  if (key.split('.').length === 4) {
    if (keys !== 'stage,text') {
      throw new EventError(`work-unit status requires exactly {stage, text}: ${key}`);
    }
    if (!STAGES.has(value.stage)) {
      throw new EventError(`stage must be one of ${[...STAGES].join('/')}: ${value.stage}`);
    }
  } else if (keys !== 'text') {
    throw new EventError(`section status requires exactly {text} without stage: ${key}`);
  }
  if (typeof value.text !== 'string' || value.text === '') {
    throw new EventError(`status.text must be a non-empty string: ${key}`);
  }
};

export const isLogTool = (tool) =>
  LOG_TOOLS.has(tool) || (typeof tool === 'string' && tool.startsWith('mcp_'));

const assertLogValue = (key, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventError(`log value must be an object: ${key}`);
  }
  if (typeof value.tool !== 'string' || !isLogTool(value.tool)) {
    throw new EventError(
      `log tool must be one of read/edit/write/skill/bash/websearch/webfetch/task or mcp_*: ${key}`,
    );
  }
  if (!Number.isInteger(value.gap) || value.gap < 0) {
    throw new EventError(`log gap must be a non-negative integer: ${key}`);
  }
  if (Object.keys(value).toSorted().join(',') !== 'gap,targets,tool') {
    throw new EventError(`log value requires exactly {tool, gap, targets}: ${key}`);
  }
  if (
    !Array.isArray(value.targets) ||
    value.targets.length === 0 ||
    value.targets.some((target) => typeof target !== 'string' || target === '')
  ) {
    throw new EventError(`log targets must be a non-empty string array: ${key}`);
  }
};

export const buildEvent = (draft, ts = jstNow()) => {
  if (!EVENT_TYPES.has(draft.type)) {
    throw new EventError(`type must be one of ${[...EVENT_TYPES].join('/')}`);
  }
  validateKey(draft.key);
  const event = { ts, type: draft.type, key: draft.key };
  if (draft.type === 'set') {
    if (draft.value === undefined) throw new EventError('value is required for set');
    if (draft.key.endsWith('.status')) assertStatusValue(draft.key, draft.value);
    if (draft.key.startsWith('log.')) assertLogValue(draft.key, draft.value);
    event.value = draft.value;
  }
  return event;
};

export const readEvents = () => {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs
    .readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const event = JSON.parse(line);
      if (typeof event.ts !== 'string' || event.type === undefined || event.key === undefined) {
        fail(`invalid event at line ${index + 1}`);
      }
      return event;
    });
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

export const parseCheckpoint = (text) => {
  let checkpoint;
  try {
    checkpoint = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !checkpoint ||
    typeof checkpoint !== 'object' ||
    Array.isArray(checkpoint) ||
    !checkpoint.trees ||
    typeof checkpoint.trees !== 'object' ||
    Array.isArray(checkpoint.trees)
  ) {
    return null;
  }
  return { trees: checkpoint.trees, compactedAt: checkpoint.compactedAt ?? null };
};

export const stripHistory = (value) => {
  if (Array.isArray(value)) return value.map(stripHistory);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'status' && key !== 'updatedAt')
        .map(([key, child]) => [key, stripHistory(child)]),
    );
  }
  return value;
};

export const writeCheckpoint = (trees, compactedAt = jstNow()) => {
  fs.writeFileSync(
    CHECKPOINT_PATH,
    `${JSON.stringify({ compactedAt, asOf: null, trees }, null, 2)}\n`,
  );
};

// チェックポイントを読み込み、畳み込みの起点とする。
// 空ファイルや不正な JSON も「チェックポイントなし」と同じ起点にする
export const loadBase = () => {
  if (!fs.existsSync(CHECKPOINT_PATH)) {
    return { trees: { product: {}, meta: {} }, compactedAt: null };
  }
  return (
    parseCheckpoint(fs.readFileSync(CHECKPOINT_PATH, 'utf8')) ?? {
      trees: { product: {}, meta: {} },
      compactedAt: null,
    }
  );
};

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
export const UNRESOLVED_STAGES = new Set(['ready', 'implement']);

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
