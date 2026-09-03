// イベントの検証と組み立て。append の受け入れ条件（events/README.md 参照）をここで強制する
import process from 'node:process';
import { EventError, jstNow } from './util.mjs';
import {
  EVENT_TYPES,
  FACT_SECTIONS,
  LOG_TOOLS,
  META_SECTIONS,
  NAMESPACES,
  PRODUCT_SECTIONS,
  STAGES,
} from './consts.mjs';

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
  // ブランチ名は環境変数から付与する（merge で自ブランチのデルタを特定するため）。
  // 未設定（テスト・非 git 環境）なら省略し、空文字は不正として拒否する
  const branch = process.env.EVENTS_BRANCH;
  if (branch !== undefined) {
    if (typeof branch !== 'string' || branch === '') {
      throw new EventError('EVENTS_BRANCH must be a non-empty string');
    }
    event.branch = branch;
  }
  if (draft.type === 'set') {
    if (draft.value === undefined) throw new EventError('value is required for set');
    if (draft.key.endsWith('.status')) assertStatusValue(draft.key, draft.value);
    if (draft.key.startsWith('log.')) assertLogValue(draft.key, draft.value);
    event.value = draft.value;
  }
  return event;
};
