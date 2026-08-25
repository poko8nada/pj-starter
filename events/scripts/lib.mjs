// events/ 駆動システムの共有ライブラリ。append / build / compact の各スクリプトから使われる
// 詳細な仕様は events/README.md を参照
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// events/ の位置。テスト時は EVENTS_DIR で差し替えできる
export const EVENTS_DIR =
  process.env.EVENTS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOG_PATH = path.join(EVENTS_DIR, 'log.jsonl');
export const SNAPSHOTS_DIR = path.join(EVENTS_DIR, 'snapshots');
export const CHECKPOINT_PATH = path.join(EVENTS_DIR, 'checkpoint.json');

// 名前空間と検証規則。product / meta の第2セグメントは固定区画のみ許容する
export const NAMESPACES = new Set(['product', 'meta']);
export const PRODUCT_SECTIONS = new Set([
  'name',
  'what',
  'stack',
  'look',
  'features',
  'roadmap',
  'deploy',
]);
// status を持てる事実セクション。features は作業単位の収集点なので対象外
export const FACT_SECTIONS = new Set(['name', 'what', 'stack', 'look', 'roadmap', 'deploy']);
export const META_SECTIONS = new Set(['harness', 'agents', 'skills', 'docs', 'scripts']);
export const EVENT_TYPES = new Set(['set', 'del']);
// 作業単位の段階。4段階を product / meta 共通で使う
export const STAGES = new Set(['planned', 'ready', 'implement', 'commit']);

// JST(+09:00) 固定の ISO 8601 タイムスタンプを生成する
export const jstNow = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

// --flag value 形式の引数を連想配列へ展開する
export const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--')) fail(`unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
};

// 値は JSON として解釈できればその結果、不可なら生の文字列を扱う
export const parseValue = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    // JSON 以外の文字列はそのまま値として使う
    return raw;
  }
};

// 規約違反。CLI 層で fail() へ変換される
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
  if (!isWorkUnit && !isFactSection)
    throw new EventError(`status is only allowed on fact sections or work units: ${key}`);
};

// キーは「名前空間.区画. ...」のドットパス。status の部分書き込み（.status.stage 等）は
// 常に拒否し、status は丸ごと主張させる
export const validateKey = (key) => {
  if (!key) throw new EventError('key is required');
  if (key.includes('.status.')) throw new EventError(`status must be asserted whole: ${key}`);
  const [ns, section] = key.split('.');
  if (!NAMESPACES.has(ns)) throw new EventError(`unknown namespace: ${ns}`);
  if (ns === 'product' && !PRODUCT_SECTIONS.has(section))
    throw new EventError(
      `product section must be one of ${[...PRODUCT_SECTIONS].join('/')}: ${key}`,
    );
  if (ns === 'meta' && !META_SECTIONS.has(section))
    throw new EventError(`meta section must be one of ${[...META_SECTIONS].join('/')}: ${key}`);
  if (key.endsWith('.status')) assertStatusLocation(key);
};

// status 値の形状。作業単位は {stage, text}、事実セクションは {text} のみを許す
const assertStatusValue = (key, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EventError(`status must be an object: ${key}`);
  const keys = Object.keys(value).toSorted().join(',');
  if (key.split('.').length === 4) {
    if (keys !== 'stage,text')
      throw new EventError(`work-unit status requires exactly {stage, text}: ${key}`);
    if (!STAGES.has(value.stage))
      throw new EventError(`stage must be one of ${[...STAGES].join('/')}: ${value.stage}`);
  } else if (keys !== 'text')
    throw new EventError(`section status requires exactly {text} without stage: ${key}`);
  if (typeof value.text !== 'string' || value.text === '')
    throw new EventError(`status.text must be a non-empty string: ${key}`);
};

// 下書き（ts を除くイベント）を検証して完成させる。
// ts は既定でここで JST として付与するが、呼び出し側から同一tsを渡すこともできる
export const buildEvent = (draft, ts = jstNow()) => {
  if (!EVENT_TYPES.has(draft.type))
    throw new EventError(`type must be one of ${[...EVENT_TYPES].join('/')}`);
  validateKey(draft.key);
  const event = { ts, type: draft.type, key: draft.key };
  if (draft.type === 'set') {
    if (draft.value === undefined) throw new EventError('value is required for set');
    if (draft.key.endsWith('.status')) assertStatusValue(draft.key, draft.value);
    event.value = draft.value;
  }
  return event;
};

// アクティブなログを読み込み、イベントの配列を返す
export const readEvents = () =>
  fs
    .readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const event = JSON.parse(line);
      if (typeof event.ts !== 'string' || event.type === undefined || event.key === undefined)
        fail(`invalid event at line ${index + 1}`);
      return event;
    });

// チェックポイントを読み込み、畳み込みの起点とする
export const loadBase = () => {
  if (!fs.existsSync(CHECKPOINT_PATH))
    return { trees: { product: {}, meta: {} }, compactedAt: null };
  const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  return { trees: checkpoint.trees, compactedAt: checkpoint.compactedAt };
};

// ドットパスの位置に値を上書きする。途中のノードがスカラーならオブジェクトへ置き換わる
export function setPath(tree, key, value) {
  const parts = key.split('.');
  let node = tree;
  for (const part of parts.slice(0, -1)) {
    if (node[part] === null || typeof node[part] !== 'object' || Array.isArray(node[part]))
      node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = value;
}

// 空になった祖先ノードを枝刈りする。depth > 1 により名前空間の第1セグメントは保持される
const pruneEmpty = (tree, parts) => {
  for (let depth = parts.length; depth > 1; depth--) {
    const chain = parts.slice(0, depth);
    let node = tree;
    for (const part of chain.slice(0, -1)) node = node[part];
    const last = chain.at(-1);
    if (node && typeof node[last] === 'object' && Object.keys(node[last]).length === 0)
      delete node[last];
    else return;
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

// マーカーフィールドを持つ作業単位（オブジェクト）だけを取り出す
const workUnits = (container, marker) =>
  Object.values(container ?? {}).filter(
    (node) => node && typeof node === 'object' && !Array.isArray(node) && marker in node,
  );

// 作業単位（trigger / purpose を持つノード）に status の初期値を補完し、語彙を検証する。
// stage は機械的な段階、status.text は常に書く進捗文
export const normalizeTrees = (trees) => {
  const units = [
    ...workUnits(trees.product?.features, 'trigger'),
    ...Object.values(trees.meta ?? {}).flatMap((section) => workUnits(section, 'purpose')),
  ];
  for (const node of units) {
    if (!node.status || typeof node.status !== 'object' || Array.isArray(node.status))
      node.status = {};
    node.status.stage ??= 'planned';
    node.status.text ??= '未着手';
    if (!STAGES.has(node.status.stage)) throw new EventError(`invalid stage: ${node.status.stage}`);
  }
};

// status を持つノードへ最終更新日（YYYYMMDD）を注入する。
// ノード自身またはその配下への set イベントのうち最新の ts を使う。
// 該当イベントがないノードは既存値（checkpoint 由来）を保持する
export const injectUpdatedAt = (trees, events) => {
  const stamp = (node, prefix) => {
    let latest = '';
    for (const event of events) {
      if (event.type !== 'set') continue;
      if ((event.key === prefix || event.key.startsWith(`${prefix}.`)) && event.ts > latest)
        latest = event.ts;
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
  for (const ns of NAMESPACES) {
    trees[ns] ??= {};
    walk(trees[ns], ns);
  }
};

// チェックポイント起点 + アクティブログ全体を畳み込む。
// asOf は「この状態がどの時点のイベントまで反映済みか」を表す
export const foldAll = () => {
  const base = loadBase();
  const events = readEvents();
  for (const event of events) {
    const [ns, ...rest] = event.key.split('.');
    if (event.type === 'set') setPath(base.trees[ns], rest.join('.'), event.value);
    else deletePath(base.trees[ns], rest.join('.'));
  }
  const lastEventTs = events.at(-1)?.ts ?? '';
  const asOf =
    base.compactedAt !== null && base.compactedAt >= lastEventTs
      ? base.compactedAt
      : lastEventTs || null;
  return { trees: base.trees, asOf, events };
};

// キー順を正規化した文字列化。生成物の同一性判定に使う
const sortValue = (value) => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, sortValue(value[k])]),
    );
  return value;
};
export const stableStringify = (value) => JSON.stringify(sortValue(value));
