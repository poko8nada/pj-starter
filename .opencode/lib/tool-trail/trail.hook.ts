// 書き込みは incremental マージ：メモリ上の直前 trail 行とファイル末尾が両方 log.try 行で、かつ同一ツールなら1行にマージ。
// ファイル末尾が状態イベントの場合はマージせず新規行（状態イベント保護）。
// 状態は createTrail のクロージャ内に閉じ込め、プラグイン間の共有を不要にする。
// gap は直前 trail 行の ts から算出、ターン終了（idle/error）で lastTrailLine をリセット。busy ではリセットしない（ターン内マージを許可）。
// git commit 検知後は session.idle/error まで trail 追記を抑止する（commit 後のアイドル動作でログが汚れるのを防ぐ）。
// どの失敗も痕跡1行の欠落に留め、ツール実行の流れ自体は止めない
import fs from 'node:fs';
import path from 'node:path';
import { buildTrailEvent, isCommitCommand, mergeTrailEvents, type TrailEvent } from './trail';

export interface TrailBeforeInput {
  tool: string;
  sessionID: string;
  args: Record<string, unknown>;
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
  event(input: TrailEventInput): void;
}

const isLastLineTrail = (logPath: string): boolean => {
  if (!fs.existsSync(logPath)) return false;
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return false;
  try {
    const parsed: unknown = JSON.parse(lines.at(-1) ?? '');
    if (typeof parsed !== 'object' || parsed === null || !('key' in parsed)) return false;
    const key = (parsed as { key?: unknown }).key;
    return typeof key === 'string' && key.startsWith('log.try.');
  } catch {
    return false;
  }
};

// 最後の非空行をマージ行で置き換える。
// 空行を無視し、行末に改行が無い場合や末尾に空行がある場合でも正しく扱う
const replaceLastLine = (logPath: string, merged: TrailEvent): void => {
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n');
  // 末尾の空要素（最終改行や連続空行によるもの）をすべて除去
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // 最後の非空行を探す（trim で空行判定）
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
  const logPath = path.join(root, 'events', 'log.jsonl');
  let lastTrailLine: TrailEvent | null = null;
  const subSessions = new Set<string>();
  let suppressTrail = false;

  return {
    before(input) {
      if (subSessions.has(input.sessionID)) return;
      if (suppressTrail) return;
      if (input.tool === 'bash' && isCommitCommand(input.args.command)) {
        suppressTrail = true;
        return;
      }
      const gap =
        lastTrailLine === null ? 0 : Math.max(0, Date.now() - new Date(lastTrailLine.ts).getTime());
      try {
        const event = buildTrailEvent({ tool: input.tool, args: input.args, gap, root });
        if (event === null) return;
        if (lastTrailLine !== null && isLastLineTrail(logPath)) {
          const merged = mergeTrailEvents(lastTrailLine, event);
          if (merged !== null) {
            replaceLastLine(logPath, merged);
            repairLog(logPath);
            lastTrailLine = merged;
            return;
          }
        }
        fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
        repairLog(logPath);
        lastTrailLine = event;
      } catch {
        // 書き込み失敗はベストエフォート。次の試行でまた試される
      }
    },
    event(input) {
      if (input.type === 'session.created') {
        const info = input.properties.info;
        if (info?.parentID && info?.id) subSessions.add(info.id);
        return;
      }
      const sessionID = input.properties.sessionID;
      const isBoundary =
        (input.type === 'session.idle' || input.type === 'session.error') &&
        !!sessionID &&
        !subSessions.has(sessionID);
      if (isBoundary && sessionID) {
        lastTrailLine = null;
        suppressTrail = false;
        subSessions.delete(sessionID);
      }
    },
  };
};
