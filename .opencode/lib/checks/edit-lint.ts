// 編集系ツールの直後に、編集ファイルへの report-only lint を実行して結果をツール出力へ追記する。
// --fix は使わない。エージェントの認識中の内容とディスクの乖離を避けるため。
// 編集の発生自体は dirty フラグとして記録し、idle 時の品質整備の実行条件に使う
import type { Plugin } from '@opencode-ai/plugin';
import { clipLines } from './text';

type PluginInput = Parameters<Plugin>[0];

export interface EditLintCtx {
  $: PluginInput['$'];
  root: string;
}

const MAX_REPORT_LINES = 20;
const EDIT_TOOLS = new Set(['edit', 'write']);

let dirty = false;

export const markDirty = (): void => {
  dirty = true;
};

export const consumeDirty = (): boolean => {
  const value = dirty;
  dirty = false;
  return value;
};

export const runEditLint = async (
  ctx: EditLintCtx,
  input: { tool: string; args?: { filePath?: unknown } },
  output: { output: string },
): Promise<void> => {
  if (!EDIT_TOOLS.has(input.tool)) return;
  const file = input.args?.filePath;
  if (typeof file !== 'string' || file === '') return;
  markDirty();
  const result = await ctx.$`pnpm exec oxlint ${file}`.cwd(ctx.root).nothrow().quiet();
  if (result.exitCode === 0) return;
  const report = clipLines(
    `${result.stdout.toString()}\n${result.stderr.toString()}`,
    MAX_REPORT_LINES,
  );
  output.output += `\n\n[lint] oxlint detected issues:\n${report}`;
};
