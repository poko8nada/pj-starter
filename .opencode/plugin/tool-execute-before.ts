// フックランタイム： 編集ツールのゲート、トライル記録、未確定フォローアップ（tool.execute.before）。
// ステータス記録（append.mjs + .status を含む bash）を観測するまで edit/write をブロックし、記録後に編集を許可する。session.idle で git がクリーンならゲートを復活させる
// サブエージェントセッション（session.created で parentID を持つもの）は exempt し、プロジェクトルート外のファイル編集はゲート対象外
// git が使われていない（リポジトリなし・コミット前）プロジェクトではゲートを無効化してスルーする。enabled は起動時に1回だけ決定し、プロセス中は再評価しない
// 未確定フォローアップは git commit 時に未確定コンポーネントを検知し1回だけ促す。コミット成功で復活する（unresolved.hook.ts）
// root は起動時に1回だけ resolveProjectRoot で解決し、per-call の fs I/O を避ける
import type { Plugin } from '@opencode-ai/plugin';
import { createGate } from '../lib/edit-gate/gate.hook';
import { isGitClean, isGitRepo } from '../lib/edit-gate/git.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { createTrail } from '../lib/tool-trail/trail.hook';
import { runUnresolvedFollowup, settleFollowup } from '../lib/unresolved-followup/unresolved.hook';
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
      const gateReport = gate.evaluate({
        sessionID: input.sessionID,
        tool: input.tool,
        command: output.args?.command,
        filePath: output.args?.filePath,
      });
      const followupReport = await runUnresolvedFollowup(
        { $, root },
        { tool: input.tool, command: output.args?.command },
      );
      // gate と unresolved は prefix を分けて汚染しない
      const message = buildMessage(
        '[gate] Load the skill required for the project, Record a status before editing.',
        gateReport,
      );
      const followupMessage = buildMessage(followupReport);
      if (message !== null && followupMessage !== null) {
        throw new Error(`${message}\n\n${followupMessage}`);
      }
      if (message !== null) throw new Error(message);
      if (followupMessage !== null) throw new Error(followupMessage);
    },
    event: async ({ event }) => {
      trail.event(event);
      if (event.type === 'session.created') {
        if (event.properties.info?.parentID && event.properties.info?.id) {
          gate.exempt(event.properties.info.id);
        }
        return;
      }
      if (event.type !== 'session.idle') return;
      if (await isGitClean({ $, root })) gate.close(event.properties.sessionID);
      await settleFollowup({ $, root });
    },
  };
};
