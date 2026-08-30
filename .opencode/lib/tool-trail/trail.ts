// ツールトレイルの純粋コア。ツール試行1件を log.try.<id> のイベントへ構築する。
// 検証と ts 付与は events 側の正規経路（buildEvent）に委ね、ここでは機械固有の
// ロジック（ホワイトリスト・パス抽出・root相対化）だけを持つ
import { randomUUID } from 'node:crypto';
import { buildEvent } from '../../../events/scripts/lib.mjs';
import { toRootRelative } from '../utils/path';
import { isTrailTool } from '../utils/tools';

// ツール群で引数名が揺れるため、代表的なキーを順に当てて対象パスを取り出す
const pathFromInput = (input: Record<string, unknown>): string | null => {
  for (const key of ['filePath', 'path', 'file']) {
    const value = input[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
};

export type TrailValue =
  | { tool: 'read' | 'edit' | 'write'; gap: number; path: string }
  | { tool: 'skill'; gap: number; name: string };

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
// 対象外ツール・不正な gap・パス欠落・root 外は null（記録しない）
export const buildTrailEvent = (input: TrailInput): TrailEvent | null => {
  const tool = input.tool.toLowerCase();
  if (!isTrailTool(tool)) return null;
  if (!Number.isInteger(input.gap) || input.gap < 0) return null;
  let value: TrailValue;
  if (tool === 'skill') {
    const name = input.args.name;
    if (typeof name !== 'string' || name === '') return null;
    value = { tool, gap: input.gap, name };
  } else {
    const path = pathFromInput(input.args);
    if (path === null) return null;
    const label = toRootRelative(input.root, path);
    if (label === null) return null;
    value = { tool, gap: input.gap, path: label };
  }
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
