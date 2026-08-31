// 記録（append.mjs / append-build.mjs + .status を含む bash）を観測するまで edit/write をブロックする。
// サブエージェントセッション（exempt）とプロジェクトルート外のファイル編集は対象外。
// createGate は純メモリ（Set ルックアップ + 文字列比較）で、fs I/O を伴わない。
// ハンドラーは Report を返し、メッセージ組み立ては呼び出し側（buildMessage）が行う
import type { Report } from '../utils/shared';
import { isEditTool } from '../utils/shared';
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

const STATUS_SET_PATTERN = /--set\s+['"]?\S+\.status\b/;
const APPEND_SCRIPT_PATTERN = /(append|append-build)\.mjs/;

export const createGate = (options?: { enabled?: boolean; root?: string }): Gate => {
  const enabled = options?.enabled ?? true;
  const root = options?.root;
  const openSessions = new Set<string>();
  const exemptSessions = new Set<string>();

  const isStatusAppend = (tool: string, command: unknown): boolean =>
    tool === 'bash' &&
    typeof command === 'string' &&
    APPEND_SCRIPT_PATTERN.test(command) &&
    STATUS_SET_PATTERN.test(command);

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
