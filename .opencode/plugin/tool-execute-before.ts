// フックランタイム： プロセス順守チェック、トライル記録、未確定フォローアップ（tool.execute.before）。
// ステータス記録（append.mjs + .status を含む bash）を観測するまで edit/write をブロックし、記録後に編集を許可する。session.idle で git がクリーンならチェックを復活させる
// サブエージェントセッション（session.created で parentID を持つもの）は exempt し、プロジェクトルート外のファイル編集はチェック対象外
// git が使われていない（リポジトリなし・コミット前）プロジェクトではチェックを無効化してスルーする。enabled は起動時に1回だけ決定し、プロセス中は再評価しない
// 未確定フォローアップは git commit 時に未確定コンポーネントを検知し1回だけ促す。コミット成功で復活する（unresolved.hook.ts）
// root は起動時に1回だけ resolveProjectRoot で解決し、per-call の fs I/O を避ける
import type { Plugin } from '@opencode-ai/plugin';
import { isCompactCommand } from '../lib/compact-guard/guard';
import { createCompliance } from '../lib/process-compliance/compliance.hook';
import { isGitClean, isGitRepo } from '../lib/process-compliance/git.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { createTrail } from '../lib/tool-trail/trail.hook';
import { runUnresolvedFollowup, settleFollowup } from '../lib/unresolved-followup/unresolved.hook';
import { buildMessage } from '../lib/utils/message';
import type { Report } from '../lib/utils/shared';

export const ToolExecuteBeforePlugin: Plugin = async ({ worktree, directory, $ }) => {
  const root = resolveProjectRoot({ worktree, directory });
  const enabled = await isGitRepo({ $, root });
  const compliance = createCompliance({ enabled, root });
  const trail = createTrail(root);

  return {
    'tool.execute.before': async (input, output) => {
      // 試行の記録はチェックより先に書く。ブロックされた編集も「試行」として残る
      trail.before({ tool: input.tool, sessionID: input.sessionID, args: output.args });
      // 各チェックは Report を返し、buildMessage で結合して全指摘を一度に見せる
      const compactReport: Report = isCompactCommand(output.args?.command)
        ? { errors: ['[compact] Agents cannot run compaction. Ask the user to run it if needed.'] }
        : { errors: [] };
      const complianceReport = compliance.evaluate({
        sessionID: input.sessionID,
        tool: input.tool,
        command: output.args?.command,
        filePath: output.args?.filePath,
      });
      const followupReport = await runUnresolvedFollowup(
        { $, root },
        { tool: input.tool, command: output.args?.command },
      );
      // compliance と unresolved は prefix を分けて汚染しない
      const message = buildMessage(
        '[process-compliance] You are bypassing the project process. Load the skill for the work unit, record the status transition first, then edit.',
        complianceReport,
      );
      const compactMessage = buildMessage(compactReport);
      const followupMessage = buildMessage(followupReport);
      const parts = [message, compactMessage, followupMessage].filter(
        (m): m is string => m !== null,
      );
      if (parts.length > 0) throw new Error(parts.join('\n\n'));
    },
    event: async ({ event }) => {
      trail.event(event);
      if (event.type === 'session.created') {
        if (event.properties.info?.parentID && event.properties.info?.id) {
          compliance.exempt(event.properties.info.id);
        }
        return;
      }
      if (event.type !== 'session.idle') return;
      if (await isGitClean({ $, root })) compliance.close(event.properties.sessionID);
      await settleFollowup({ $, root });
    },
  };
};
