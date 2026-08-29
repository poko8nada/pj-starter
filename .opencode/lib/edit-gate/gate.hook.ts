// セッションごとにステータス記録を要求するゲート判定。
// 記録（append.mjs + .status を含む bash）を観測するまで edit/write をブロックする。
// createGate は純メモリ（Set ルックアップ + 文字列比較）で、fs I/O を伴わない。
// ハンドラーは Report を返し、メッセージ組み立ては呼び出し側（buildMessage）が行う
import type { Report } from '../utils/report';
import { isEditTool } from '../utils/tools';

export interface GateInput {
  sessionID: string;
  tool: string;
  command?: unknown;
}

export interface Gate {
  evaluate: (input: GateInput) => Report;
  open: (sessionID: string) => void;
  close: (sessionID: string) => void;
}

const STATUS_APPEND_MARKERS = ['append.mjs', '.status'];

export const createGate = (options?: { enabled?: boolean }): Gate => {
  const enabled = options?.enabled ?? true;
  const openSessions = new Set<string>();

  // ステータス記録の観測: bash で append.mjs と .status を含むコマンドのみ true。
  // 文字列比較のみで実行結果（成功/失敗）は見ない（内容検証は append スクリプトの責務）
  const isStatusAppend = (tool: string, command: unknown): boolean =>
    tool === 'bash' &&
    typeof command === 'string' &&
    STATUS_APPEND_MARKERS.every((marker) => command.includes(marker));

  return {
    evaluate: (input) => {
      if (!enabled) return { errors: [] };
      if (isStatusAppend(input.tool, input.command)) {
        openSessions.add(input.sessionID);
        return { errors: [] };
      }
      if (isEditTool(input.tool) && !openSessions.has(input.sessionID))
        return { errors: ['no status transition recorded in this session'] };
      return { errors: [] };
    },
    open: (sessionID) => {
      openSessions.add(sessionID);
    },
    close: (sessionID) => {
      openSessions.delete(sessionID);
    },
  };
};
