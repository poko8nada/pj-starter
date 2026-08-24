// 編集系ツールの直後に、編集ファイルへの report-only lint を実行して結果を返す。
// --fix は使わない。エージェントの認識中の内容とディスクの乖離を避けるため。
// 返り値は Report（整形済み英語メッセージ）。ツール出力への追記は plugin 直下の責務
import type { Plugin } from '@opencode-ai/plugin';
import type { Report } from '../utils/report';
import { clipLines } from '../utils/text';

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
): Promise<Report> => {
  if (!EDIT_TOOLS.has(input.tool)) return { errors: [] };
  const file = input.args?.filePath;
  if (typeof file !== 'string' || file === '') return { errors: [] };
  markDirty();
  const result = await ctx.$`pnpm exec oxlint ${file}`.cwd(ctx.root).nothrow().quiet();
  if (result.exitCode === 0) return { errors: [] };
  const report = clipLines(
    `${result.stdout.toString()}\n${result.stderr.toString()}`,
    MAX_REPORT_LINES,
  );
  return { errors: [`[lint] oxlint detected issues:\n${report}`] };
};
