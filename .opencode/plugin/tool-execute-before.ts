// フックランタイム： 全ツール実行のゲート（tool.execute.before）。
// セッションごとに events/README.md の読み込みを一度要求し、読むまで他のツール実行をthrow でブロックする。解除は read ツールで events/README.md を開いた時のみ。
// session.created で解除状態をリセットし、「1回読めばそのセッションはOK」を実現する。
// root は起動時に1回だけ resolveProjectRoot で解決し、per-call の fs I/O を避ける
import type { Plugin } from '@opencode-ai/plugin';
import { createGate } from '../lib/events-read-gate/gate.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { buildMessage } from '../lib/utils/message';

export const ToolExecuteBeforePlugin: Plugin = async ({ worktree, directory }) => {
  const gate = createGate(resolveProjectRoot({ worktree, directory }));

  return {
    'tool.execute.before': async (input, output) => {
      const report = gate.evaluate({
        sessionID: input.sessionID,
        tool: input.tool,
        filePath: output.args?.filePath,
      });
      const message = buildMessage(
        '[gate] events/README.md has not been read in this session. It is the operating spec of this project — the recording contract (namespaces, keys, status shapes, stage vocabulary) that every append is validated against. Read it with the read tool, then state the recording contract in your next message before any other tool call; actions that violate it are rejected.',
        report,
      );
      if (message !== null) throw new Error(message);
    },
    event: async ({ event }) => {
      if (event.type !== 'session.created') return;
      gate.close(event.properties.info.id);
    },
  };
};
