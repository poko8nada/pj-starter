// フックランタイム： 編集系ツールの直後（tool.execute.after）。
// report-only の lint を差し込み、結果をツール出力へ追記する。
// あわせてトライルのギャップ計測基準（前ツール完了時刻）を更新する。処理の実体は lib 配下。
import type { Plugin } from '@opencode-ai/plugin';
import { runEditLint } from '../lib/checks/edit-lint.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { createTrail } from '../lib/tool-trail/trail.hook';
import { buildMessage } from '../lib/utils/message';

export const EditLintPlugin: Plugin = async ({ $, worktree, directory }) => {
  const root = resolveProjectRoot({ worktree, directory });
  const trail = createTrail(root);

  return {
    'tool.execute.after': async (input, output) => {
      // ギャップ計測の基準（前ツール完了時刻）を更新する
      trail.after({ sessionID: input.sessionID });
      const report = await runEditLint({ $, root }, input);
      const message = buildMessage(report);
      if (message !== null) output.output += `\n\n${message}`;
    },
  };
};
