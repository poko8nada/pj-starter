// ツールトレイルの純粋コア。対象抽出・root相対化・マージ判定のみを持つ。
// 検証と ts 付与は buildEvent（events/scripts/validation.mjs）へ委ねる。全体の仕様は events/README.md#machine-injected trail 参照
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

// bash コマンドが git commit かどうかを判定する。
// 直接コミット（commit スキルを経ない git commit）を trail 窓のバックストップとして閉じるために使用する。
// "git commit" の後に空白または行末が続く場合のみ true（"git commit--amend" 等の誤検知を避ける）
export const isCommitCommand = (command: unknown): boolean => {
  if (typeof command !== 'string') return false;
  return /^git\s+commit(\s|$)/.test(command.trim());
};

// bash コマンドが events への append かどうかを判定する。
// append は work unit の開始（trail ON）と closing（stage:commit アサート、trail OFF）の境界マーカー。
// "node events/scripts/append(-build)?.mjs"（./ プレフィックス許容）の後に空白または行末が続く場合のみ true
export const isAppendCommand = (command: unknown): boolean => {
  if (typeof command !== 'string') return false;
  return /^node\s+(?:\.\/)?events\/scripts\/append(-build)?\.mjs(\s|$)/.test(command.trim());
};

// append コマンドが stage:commit をアサートする closing append かどうかを判定する。
// work unit の意味的終了。バッチファイル（--file）内の stage:commit は検知しない（まれなケースとして許容）
export const isClosingAppend = (command: unknown): boolean => {
  if (typeof command !== 'string') return false;
  return isAppendCommand(command) && /"stage"\s*:\s*"commit"/.test(command);
};

// 連続する同一ツールの試行を1行にマージする。異なるツールは null。
// key / gap は最初の試行のものを保持し、ts は最終試行の時刻、targets を伸ばす
export const mergeTrailEvents = (last: TrailEvent, next: TrailEvent): TrailEvent | null => {
  if (last.value.tool !== next.value.tool) return null;
  return {
    ts: next.ts,
    type: 'set',
    key: last.key,
    value: {
      tool: last.value.tool,
      gap: last.value.gap,
      targets: [...last.value.targets, ...next.value.targets],
    },
  };
};
