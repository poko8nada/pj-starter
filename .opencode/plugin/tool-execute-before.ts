// フックランタイム： 編集ツールのゲートとトライル記録（tool.execute.before）。
// ステータス記録（append.mjs + .status を含む bash）を観測するまで edit/write をブロックし、記録後に編集を許可する。session.idle で git がクリーンならゲートを復活させる
// サブエージェントセッション（session.created で parentID を持つもの）は exempt し、プロジェクトルート外のファイル編集はゲート対象外
// git が使われていない（リポジトリなし・コミット前）プロジェクトではゲートを無効化してスルーする。enabled は起動時に1回だけ決定し、プロセス中は再評価しない
// root は起動時に1回だけ resolveProjectRoot で解決し、per-call の fs I/O を避ける
import type { Plugin } from '@opencode-ai/plugin';
import { createGate } from '../lib/edit-gate/gate.hook';
import { isGitClean, isGitRepo } from '../lib/edit-gate/git.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { createTrail } from '../lib/tool-trail/trail.hook';
import { buildMessage } from '../lib/utils/message';

export const ToolExecuteBeforePlugin: Plugin = async ({ worktree, directory, $ }) => {
  const root = resolveProjectRoot({ worktree, directory });
  const enabled = await isGitRepo({ $, root });
  const gate = createGate({ enabled, root });
  const trail = createTrail(root);

  return {
    'tool.execute.before': async (input, output) => {
      // 試行の記録はゲートより先に書く。ブロックされた編集も「試行」として残る
      trail.before({ tool: input.tool, sessionID: input.sessionID, args: output.args });
      const report = gate.evaluate({
        sessionID: input.sessionID,
        tool: input.tool,
        command: output.args?.command,
        filePath: output.args?.filePath,
      });
      const message = buildMessage(
        '[gate] Record a status transition before editing. Read events/README.md (the recording contract), load the matching skill (feature → agenda for new features, agenda for updates), then append via events/scripts/append.mjs.',
        report,
      );
      if (message !== null) throw new Error(message);
    },
    event: async ({ event }) => {
      if (event.type === 'session.created') {
        // サブエージェントセッション（parentID を持つ）はゲート対象外
        if (event.properties.info?.parentID && event.properties.info?.id)
          gate.exempt(event.properties.info.id);
        return;
      }
      if (event.type !== 'session.idle') return;
      if (await isGitClean({ $, root })) gate.close(event.properties.sessionID);
    },
  };
};
