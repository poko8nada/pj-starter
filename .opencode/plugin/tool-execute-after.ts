// フックランタイム： 編集系ツールの直後（tool.execute.after）。
// report-only の lint を差し込み、結果をツール出力へ追記する。処理の実体は lib 配下。
import type { Plugin } from '@opencode-ai/plugin';
import { runEditLint } from '../lib/checks/edit-lint.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { buildMessage } from '../lib/utils/message';

export const EditLintPlugin: Plugin = async ({ $, worktree, directory }) => {
  const root = resolveProjectRoot({ worktree, directory });

  return {
    'tool.execute.after': async (input, output) => {
      const report = await runEditLint({ $, root }, input);
      const message = buildMessage(report);
      if (message !== null) output.output += `\n\n${message}`;
    },
  };
};
