// フックランタイム： 編集系ツールの直後（tool.execute.after）。
// report-only の lint を差し込み、bash長文出力を予算で切り詰める。処理の実体は lib 配下。
import type { Plugin } from '@opencode-ai/plugin';
import { runEditLint } from '../lib/checks/edit-lint.hook';
import { applyBudgetToOutput } from '../lib/output-budget/hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import { buildMessage } from '../lib/utils/message';

export const EditLintPlugin: Plugin = async ({ $, worktree, directory }) => {
  const root = resolveProjectRoot({ worktree, directory });

  return {
    'tool.execute.after': async (input, output) => {
      // 長文bash出力は先に予算で切り詰める（トークン節約の安全網）。
      const budgeted = applyBudgetToOutput({ tool: input.tool }, output.output);
      if (budgeted !== null) output.output = budgeted;
      const report = await runEditLint({ $, root }, input);
      const message = buildMessage(report);
      if (message !== null) output.output += `\n\n${message}`;
    },
  };
};
