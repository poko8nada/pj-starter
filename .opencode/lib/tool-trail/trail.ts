// ツールトレイルの純粋コア。ツール試行1件を log.try.<id> のイベントへ構築し、
// 連続する同一ツールの試行を1行にマージする。
// 検証と ts 付与は events 側の正規経路（buildEvent）に委ね、ここでは機械固有の
// ロジック（対象抽出・root相対化・マージ判定）だけを持つ
import { randomUUID } from 'node:crypto';
import { buildEvent, isLogTool } from '../../../events/scripts/lib.mjs';
import { toRootRelative } from '../utils/path';

// ファイル系ツール。対象パスを root 相対へ変換する
const FILE_TOOLS = new Set(['read', 'edit', 'write']);

// ツール群で引数名が揺れるため、代表的なキーを順に当てて対象パスを取り出す
const pathFromInput = (input: Record<string, unknown>): string | null => {
  for (const key of ['filePath', 'path', 'file']) {
    const value = input[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
};

const stringArg = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === 'string' && value !== '' ? value : null;
};
// bash はコマンド全体ではなく最初のコマンド名だけを対象にする（引用符や特殊文字を JSON に入れないため）。
// テーブルにないツール（MCP の mcp_*）はツール名自体を対象にする
const TARGET_EXTRACTORS: Record<string, (input: Record<string, unknown>) => string | null> = {
  read: pathFromInput,
  edit: pathFromInput,
  write: pathFromInput,
  skill: (input) => stringArg(input, 'name'),
  bash: (input) => {
    const command = stringArg(input, 'command');
    if (command === null) return null;
    const first = command.trim().split(/\s+/)[0];
    return first === '' ? null : first;
  },
  websearch: (input) => stringArg(input, 'query'),
  webfetch: (input) => stringArg(input, 'url'),
  task: (input) => stringArg(input, 'subagent_type'),
};

export interface TrailValue {
  tool: string;
  gap: number;
  targets: string[];
}

export interface TrailEvent {
  ts: string;
  type: 'set';
  key: string;
  value: TrailValue;
}

export interface TrailInput {
  tool: string;
  args: Record<string, unknown>;
  gap: number;
  root: string;
}

// ツール試行1件を検証済みの log.try.<id> イベントへ構築する。
// 対象外ツール・不正な gap・対象の欠落・root 外は null（記録しない）
export const buildTrailEvent = (input: TrailInput): TrailEvent | null => {
  const tool = input.tool.toLowerCase();
  if (!isLogTool(tool)) return null;
  if (!Number.isInteger(input.gap) || input.gap < 0) return null;
  const extractor = TARGET_EXTRACTORS[tool];
  let target = extractor === undefined ? tool : extractor(input.args);
  if (target === null) return null;
  if (FILE_TOOLS.has(tool)) {
    const label = toRootRelative(input.root, target);
    if (label === null) return null;
    target = label;
  }
  const value: TrailValue = { tool, gap: input.gap, targets: [target] };
  try {
    // buildEvent は検証と ts 付与を担う。events 側の型推論は不完全なため、
    // ここで TrailEvent の形へ組み立て直す
    const event = buildEvent({ type: 'set', key: `log.try.${randomUUID().slice(0, 8)}`, value });
    return { ts: event.ts, type: 'set', key: event.key, value };
  } catch {
    // 検証エラーはベストエフォート。この試行だけ記録されない
    return null;
  }
};

// 連続する同一ツールの試行を1行にマージする。異なるツールは null。
// 最初の試行の ts / key / gap を保持し、targets を伸ばす
export const mergeTrailEvents = (last: TrailEvent, next: TrailEvent): TrailEvent | null => {
  if (last.value.tool !== next.value.tool) return null;
  return {
    ts: last.ts,
    type: 'set',
    key: last.key,
    value: {
      tool: last.value.tool,
      gap: last.value.gap,
      targets: [...last.value.targets, ...next.value.targets],
    },
  };
};
