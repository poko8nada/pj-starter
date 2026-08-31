// 記録（append.mjs / append-build.mjs + .status を含む bash）を観測するまで edit/write をブロックする。
// サブエージェントセッション（exempt）とプロジェクトルート外のファイル編集は対象外。
// createGate は純メモリ（Set ルックアップ + 文字列比較）で、fs I/O を伴わない。
// ハンドラーは Report を返し、メッセージ組み立ては呼び出し側（buildMessage）が行う
import type { Report } from '../utils/report';
import { isEditTool } from '../utils/tools';
import { isOutsideRoot } from '../utils/path';

export interface GateInput {
  sessionID: string;
  tool: string;
  command?: unknown;
  filePath?: unknown;
}

export interface Gate {
  evaluate: (input: GateInput) => Report;
  close: (sessionID: string) => void;
  exempt: (sessionID: string) => void;
}

// ステータス記録の観測: bash で .status を含み、append 系スクリプト（append.mjs / append-build.mjs）を呼ぶコマンドのみ true。文字列比較のみで実行結果（成功/失敗）は見ない（内容検証はスクリプトの責務）
const STATUS_APPEND_SCRIPTS = ['append.mjs', 'append-build.mjs'];

export const createGate = (options?: { enabled?: boolean; root?: string }): Gate => {
  const enabled = options?.enabled ?? true;
  const root = options?.root;
  const openSessions = new Set<string>();
  const exemptSessions = new Set<string>();

  const isStatusAppend = (tool: string, command: unknown): boolean =>
    tool === 'bash' &&
    typeof command === 'string' &&
    command.includes('.status') &&
    STATUS_APPEND_SCRIPTS.some((script) => command.includes(script));

  return {
    evaluate: (input) => {
      if (!enabled) return { errors: [] };
      if (exemptSessions.has(input.sessionID)) return { errors: [] };
      if (isStatusAppend(input.tool, input.command)) {
        openSessions.add(input.sessionID);
        return { errors: [] };
      }
      if (
        isEditTool(input.tool) &&
        !openSessions.has(input.sessionID) &&
        !isOutsideRoot(root, input.filePath)
      ) {
        return { errors: ['no status transition recorded in this session'] };
      }
      return { errors: [] };
    },
    close: (sessionID) => {
      openSessions.delete(sessionID);
    },
    exempt: (sessionID) => {
      exemptSessions.add(sessionID);
    },
  };
};
