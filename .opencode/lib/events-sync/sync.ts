// ターン完了時の events 同期。しきい値を超えていれば圧縮し、常にスナップショットを最新化する。
// 圧縮は状態を不変に保つため、ここで build を併せて走らせる必要はない
import type { Plugin } from '@opencode-ai/plugin';
import { shouldCompact } from './threshold';

type PluginInput = Parameters<Plugin>[0];

export interface SyncCtx {
  $: PluginInput['$'];
  root: string;
}

export const syncEvents = async (ctx: SyncCtx): Promise<void> => {
  const wc = await ctx.$`wc -l events/log.jsonl`.cwd(ctx.root).nothrow().quiet();
  const lines = Number.parseInt(wc.stdout.toString().trim(), 10);
  if (shouldCompact(Number.isNaN(lines) ? 0 : lines))
    await ctx.$`node events/scripts/compact.mjs`.cwd(ctx.root).nothrow().quiet();
  await ctx.$`node events/scripts/build.mjs`.cwd(ctx.root).nothrow().quiet();
};
