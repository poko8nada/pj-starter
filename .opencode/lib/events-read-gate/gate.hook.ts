// セッションごとに events/README.md の読み込みを要求するゲート判定。
// createGate が root を保持し、対象パスを事前計算する。per-call の evaluate は
// 純メモリ（Set ルックアップ + 文字列比較）で、fs I/O を伴わない。
// ハンドラーは Report を返し、メッセージ組み立ては呼び出し側（buildMessage）が行う
import { join } from 'node:path';
import type { Report } from '../utils/report';

export interface GateInput {
  sessionID: string;
  tool: string;
  filePath: unknown;
}

export interface Gate {
  evaluate: (input: GateInput) => Report;
  open: (sessionID: string) => void;
  close: (sessionID: string) => void;
}

const README_REL = 'events/README.md';
const README_DOT_REL = `./${README_REL}`;

export const createGate = (root: string): Gate => {
  const readSessions = new Set<string>();
  const targetAbs = join(root, README_REL);

  // 開扉読み取り判定: read ツールで events/README.md を開いた時のみ true。
  // 相対/「./」付き/絶対の3形式を事前計算済みの文字列と厳密比較する
  // （per-call で resolve しない。正規化が必要な変形パスは解除対象外）
  const isGateOpeningRead = (tool: string, filePath: unknown): boolean =>
    tool === 'read' &&
    (filePath === README_REL || filePath === README_DOT_REL || filePath === targetAbs);

  return {
    evaluate: (input) => {
      if (readSessions.has(input.sessionID)) return { errors: [] };
      if (isGateOpeningRead(input.tool, input.filePath)) {
        readSessions.add(input.sessionID);
        return { errors: [] };
      }
      return { errors: ['events/README.md has not been read in this session yet'] };
    },
    open: (sessionID) => {
      readSessions.add(sessionID);
    },
    close: (sessionID) => {
      readSessions.delete(sessionID);
    },
  };
};
