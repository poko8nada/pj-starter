// フックランタイム： 編集系ツールの直後（tool.execute.after）。
// report-only の lint を差し込み、結果をツール出力へ追記する。処理の実体は lib 配下
import type { Plugin } from '@opencode-ai/plugin';
import { runEditLint } from '../lib/checks/edit-lint';

export const EditLintPlugin: Plugin = async ({ $, worktree }) => ({
  'tool.execute.after': async (input, output) => {
    await runEditLint({ $, root: worktree }, input, output);
  },
});
