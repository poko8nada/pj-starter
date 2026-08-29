// フックランタイム： 編集ツールのゲート（tool.execute.before）。
// ステータス記録（append.mjs + .status を含む bash）を観測するまで edit/write をブロックし、記録後に編集を許可する。session.idle で git がクリーンならゲートを復活させる
// git が使われていない（リポジトリなし・コミット前）プロジェクトではゲートを無効化してスルーする。enabled は起動時に1回だけ決定し、プロセス中は再評価しない
// root は起動時に1回だけ resolveProjectRoot で解決し、per-call の fs I/O を避ける
import type { Plugin } from '@opencode-ai/plugin';
import { createGate } from '../lib/edit-gate/gate.hook';
import { isGitClean, isGitRepo } from '../lib/edit-gate/git.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { buildMessage } from '../lib/utils/message';

export const ToolExecuteBeforePlugin: Plugin = async ({ worktree, directory, $ }) => {
  const root = resolveProjectRoot({ worktree, directory });
  const enabled = await isGitRepo({ $, root });
  const gate = createGate({ enabled });

  return {
    'tool.execute.before': async (input, output) => {
      const report = gate.evaluate({
        sessionID: input.sessionID,
        tool: input.tool,
        command: output.args?.command,
      });
      const message = buildMessage(
        '[gate] Record a status transition before editing. Read events/README.md (the recording contract), load the matching skill, then append via events/scripts/append.mjs.',
        report,
      );
      if (message !== null) throw new Error(message);
    },
    event: async ({ event }) => {
      if (event.type !== 'session.idle') return;
      if (await isGitClean({ $, root })) gate.close(event.properties.sessionID);
    },
  };
};
