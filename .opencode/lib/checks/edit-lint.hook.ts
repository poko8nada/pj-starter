import type { Report, PluginInput } from '../utils/shared';
import { clipLines, MAX_REPORT_LINES } from '../utils/text';
import { isEditTool } from '../utils/shared';

export interface EditLintCtx {
  $: PluginInput['$'];
  root: string;
}

export const DIRTY_TTL_MS = 5 * 60 * 1000;

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

export const resetDirtyForTests = (): void => {
  dirtyAt = null;
};

export const runEditLint = async (
  ctx: EditLintCtx,
  input: { tool: string; args?: { filePath?: unknown } },
): Promise<Report> => {
  if (!isEditTool(input.tool)) return { errors: [] };
  const file = input.args?.filePath;
  if (typeof file !== 'string' || file === '') return { errors: [] };
  markDirty();
  const result = await ctx.$`pnpm exec oxlint --deny-warnings ${file}`
    .cwd(ctx.root)
    .nothrow()
    .quiet();
  if (result.exitCode === 0) return { errors: [] };
  const report = clipLines(
    `${result.stdout.toString()}\n${result.stderr.toString()}`,
    MAX_REPORT_LINES,
  );
  return { errors: [`[lint] oxlint detected issues:\n${report}`] };
};
