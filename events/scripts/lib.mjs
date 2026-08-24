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
export const NAMESPACES = new Set(['product', 'meta', 'agenda']);
export const PRODUCT_SECTIONS = new Set([
  'name',
  'what',
  'stack',
  'look',
  'features',
  'roadmap',
  'deploy',
]);
export const META_SECTIONS = new Set(['harness', 'skills', 'docs', 'scripts']);
export const EVENT_TYPES = new Set(['set', 'del']);

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

// キーは「名前空間.区画. ...」のドットパス
export const validateKey = (key) => {
  if (!key) fail('--key is required');
  const [ns, section] = key.split('.');
  if (!NAMESPACES.has(ns)) fail(`unknown namespace: ${ns}`);
  if (ns === 'product' && !PRODUCT_SECTIONS.has(section))
    fail(`product section must be one of ${[...PRODUCT_SECTIONS].join('/')}: ${key}`);
  if (ns === 'meta' && !META_SECTIONS.has(section))
    fail(`meta section must be one of ${[...META_SECTIONS].join('/')}: ${key}`);
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
    return { trees: { product: {}, meta: {}, agenda: {} }, compactedAt: null };
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

// features の葉に初期値を補完する。書き手は trigger/result/route に集中できる
export const normalizeFeatures = (features) => {
  for (const node of Object.values(features ?? {}))
    if (node && typeof node === 'object' && 'trigger' in node) node.status ??= 'planned';
};

// meta の葉に初期値を補完する。purpose を持つノードをコンポーネントとみなす。
// meta は「区画→コンポーネント」の2段構造のため、2レベル走査する
export const normalizeMeta = (meta) => {
  for (const section of Object.values(meta ?? {}))
    for (const node of Object.values(section ?? {}))
      if (node && typeof node === 'object' && 'purpose' in node) node.status ??= 'planned';
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
  return { trees: base.trees, asOf };
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
