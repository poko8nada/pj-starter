// ツールトレイルのフック配線。tool.execute.before で思考ギャップを測り、対象ツールの試行を log.try.<id> として直接追記する。
// 書き込みは incremental マージ：直前の行が同一ツールの log.try 行ならその行を書き換えて targets を伸ばす。マージ対象は log.try 行のみで、状態イベントには絶対に触れない。
import fs from 'node:fs';
import path from 'node:path';
import { buildTrailEvent, mergeTrailEvents, type TrailEvent } from './trail';

// セッション単位の状態はモジュールレベルで共有する。
// テストからリセットするために export する（compact.hook.ts の compactFailureStates と同じ流儀）
export const lastActivity = new Map<string, number>();
export const subSessions = new Set<string>();
// ターン境界（busy / idle / error）で立てる「次はマージしない」フラグ。
// ターンを跨いだ同一ツールの連続を誤ってマージし、リセット後の gap を古い値で上書きしないためのもの
export const mergeBlocked = new Set<string>();

export interface TrailBeforeInput {
  tool: string;
  sessionID: string;
  args: Record<string, unknown>;
}

export interface TrailAfterInput {
  sessionID: string;
}

export interface TrailEventInput {
  type: string;
  properties: {
    sessionID?: string;
    info?: { id?: string; parentID?: string };
    status?: { type?: string };
    [key: string]: unknown;
  };
}

export interface TrailHook {
  before(input: TrailBeforeInput): void;
  after(input: TrailAfterInput): void;
  event(input: TrailEventInput): void;
}

// ログの最後の行を読み、log.try 行なら TrailEvent として返す。それ以外（状態イベント・空・不正 JSON）は null
const readLastTrailLine = (logPath: string): TrailEvent | null => {
  if (!fs.existsSync(logPath)) return null;
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(lines.at(-1) ?? '');
    if (typeof parsed !== 'object' || parsed === null || !('value' in parsed)) return null;
    const record = parsed as { type?: unknown; key?: unknown; ts?: unknown; value?: unknown };
    if (
      record.type !== 'set' ||
      typeof record.key !== 'string' ||
      !record.key.startsWith('log.try.') ||
      typeof record.ts !== 'string'
    )
      return null;
    const value = record.value;
    if (typeof value !== 'object' || value === null) return null;
    const valueRecord = value as { tool?: unknown; gap?: unknown; targets?: unknown };
    if (
      typeof valueRecord.tool !== 'string' ||
      typeof valueRecord.gap !== 'number' ||
      !Number.isInteger(valueRecord.gap) ||
      valueRecord.gap < 0 ||
      !Array.isArray(valueRecord.targets) ||
      valueRecord.targets.some((target) => typeof target !== 'string')
    )
      return null;
    return {
      ts: record.ts,
      type: 'set',
      key: record.key,
      value: { tool: valueRecord.tool, gap: valueRecord.gap, targets: valueRecord.targets },
    };
  } catch {
    return null;
  }
};

// 最後の非空行をマージ行で置き換える。
// readLastTrailLine と同じく空行を無視し、行末に改行が無い場合や末尾に空行がある場合でも正しく扱う
const replaceLastLine = (logPath: string, merged: TrailEvent): void => {
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n');
  // 末尾の空要素（最終改行や連続空行によるもの）をすべて除去
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // 最後の非空行を探す（readLastTrailLine と同様に trim で判定）
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty--;
  if (lastNonEmpty < 0) {
    fs.writeFileSync(logPath, `${JSON.stringify(merged)}\n`);
    return;
  }
  lines.splice(lastNonEmpty, 1, JSON.stringify(merged));
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`);
};

// ログ全体を検証し、破損行と空行を除去して修復する。問題がなければ何もしない。
// 書き込み経路のバグ（行の途中切断など）による破損を次の書き込みで検知・修復する保険
const repairLog = (logPath: string): void => {
  if (!fs.existsSync(logPath)) return;
  const text = fs.readFileSync(logPath, 'utf8');
  const rawLines = text.split('\n');
  const kept = rawLines.filter((line) => {
    if (line.trim() === '') return false;
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });
  if (kept.length === rawLines.length) return;
  fs.writeFileSync(logPath, kept.length === 0 ? '' : `${kept.join('\n')}\n`);
};

export const createTrail = (root: string): TrailHook => {
  // 書き込み先は root ベースで解決する（worktree が "/" に化ける環境差の吸収）
  const logPath = path.join(root, 'events', 'log.jsonl');

  const write = (input: TrailBeforeInput, gap: number): void => {
    try {
      const event = buildTrailEvent({ tool: input.tool, args: input.args, gap, root });
      if (event === null) return;
      // ターン境界直後の書き込みはマージせず新規行にする（リセット後の gap を保持する）
      const blocked = mergeBlocked.has(input.sessionID);
      mergeBlocked.delete(input.sessionID);
      const last = readLastTrailLine(logPath);
      if (!blocked && last !== null) {
        const merged = mergeTrailEvents(last, event);
        if (merged !== null) {
          replaceLastLine(logPath, merged);
          repairLog(logPath);
          return;
        }
      }
      fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
      repairLog(logPath);
    } catch {
      // 書き込み失敗はベストエフォート。次の試行でまた試される
    }
  };

  return {
    before(input) {
      if (subSessions.has(input.sessionID)) return;
      const previous = lastActivity.get(input.sessionID);
      const gap = previous === undefined ? 0 : Math.max(0, Date.now() - previous);
      write(input, gap);
    },
    after(input) {
      if (subSessions.has(input.sessionID)) return;
      lastActivity.set(input.sessionID, Date.now());
    },
    event(input) {
      if (input.type === 'session.created') {
        const info = input.properties.info;
        if (info?.parentID && info?.id) subSessions.add(info.id);
        return;
      }
      if (input.type === 'session.status') {
        const status = input.properties.status;
        if (
          status?.type === 'busy' &&
          input.properties.sessionID &&
          !subSessions.has(input.properties.sessionID)
        ) {
          lastActivity.set(input.properties.sessionID, Date.now());
          mergeBlocked.add(input.properties.sessionID);
        }
        return;
      }
      if (
        (input.type === 'session.idle' || input.type === 'session.error') &&
        input.properties.sessionID
      ) {
        lastActivity.delete(input.properties.sessionID);
        subSessions.delete(input.properties.sessionID);
        mergeBlocked.add(input.properties.sessionID);
      }
    },
  };
};
