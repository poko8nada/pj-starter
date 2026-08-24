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

// dirty の有効期限。これを過ぎた dirty は無視する（強制停止後のループ防止）
const DIRTY_TTL_MS = 5 * 60 * 1000;

let dirtyAt: number | null = null;

export const markDirty = (): void => {
  dirtyAt = Date.now();
};

export const consumeDirty = (): boolean => {
  if (dirtyAt === null) return false;
  const fresh = Date.now() - dirtyAt <= DIRTY_TTL_MS;
  dirtyAt = null;
  return fresh;
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
