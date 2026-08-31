// ターン完了時のログコンパクション。ログ行数が閾値を超えたときだけ compact.mjs を実行する。
// 失敗（compact 自体・行数取得）が TTL 内なら再実行せず空 Report を返し、
// session.idle → 失敗 → prompt 再注入のループを断つ。
// build は append-build ラッパーが担うため、ここでは実行しない
import type { Report } from '../utils/report';
import type { PluginInput } from '../utils/plugin';
import { shouldCompact } from './threshold';

export interface CompactCtx {
  $: PluginInput['$'];
  root: string;
}

// 失敗後この時間内は compact を再実行しない。rounds.ts の ROUND_RESET_MS と揃える
export const COMPACT_FAILURE_TTL_MS = 10 * 60 * 1000;

// root ごとの最終失敗時刻。テストから beforeEach で reset するため export
export const compactFailureStates = new Map<string, number>();

export const compactEvents = async (ctx: CompactCtx): Promise<Report> => {
  const lastFailureAt = compactFailureStates.get(ctx.root);
  if (lastFailureAt !== undefined && Date.now() - lastFailureAt <= COMPACT_FAILURE_TTL_MS) {
    return { errors: [] };
  }

  const wc = await ctx.$`wc -l events/log.jsonl`.cwd(ctx.root).nothrow().quiet();
  if (wc.exitCode !== 0) {
    compactFailureStates.set(ctx.root, Date.now());
    return { errors: [`[events] line count failed:\n${wc.stderr.toString().trim()}`] };
  }
  const lines = Number.parseInt(wc.stdout.toString().trim(), 10);
  if (Number.isNaN(lines)) {
    compactFailureStates.set(ctx.root, Date.now());
    return { errors: ['[events] line count is not a number'] };
  }
  if (!shouldCompact(lines)) {
    compactFailureStates.delete(ctx.root);
    return { errors: [] };
  }

  const result = await ctx.$`node events/scripts/compact.mjs`.cwd(ctx.root).nothrow().quiet();
  if (result.exitCode !== 0) {
    compactFailureStates.set(ctx.root, Date.now());
    return { errors: [`[events] compact failed:\n${result.stderr.toString().trim()}`] };
  }
  compactFailureStates.delete(ctx.root);
  return { errors: [] };
};
