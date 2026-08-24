// ターン完了時の events 同期。しきい値を超えていれば圧縮し、常にスナップショットを最新化する。
// 監査（スナップショットの整合性チェック）は build を止めず、整形済みの英語エラーメッセージを
// Report.errors として返す。カンバスは deprecated で、tool で使われない
import type { Plugin } from '@opencode-ai/plugin';
import { auditMeta, type AuditFinding } from './audit';
import type { Report } from '../utils/report';
import { shouldCompact } from './threshold';

type PluginInput = Parameters<Plugin>[0];

export interface SyncCtx {
  $: PluginInput['$'];
  root: string;
}

export const syncEvents = async (ctx: SyncCtx): Promise<Report> => {
  const errors: string[] = [];

  const wc = await ctx.$`wc -l events/log.jsonl`.cwd(ctx.root).nothrow().quiet();
  const lines = Number.parseInt(wc.stdout.toString().trim(), 10);
  if (shouldCompact(Number.isNaN(lines) ? 0 : lines)) {
    const compact = await ctx.$`node events/scripts/compact.mjs`.cwd(ctx.root).nothrow().quiet();
    if (compact.exitCode !== 0)
      errors.push(`[events] compact failed:\n${compact.stderr.toString().trim()}`);
  }

  const build = await ctx.$`node events/scripts/build.mjs`.cwd(ctx.root).nothrow().quiet();
  if (build.exitCode !== 0)
    errors.push(`[events] build failed:\n${build.stderr.toString().trim()}`);

  // read.mjs で meta を読み出し、監査する。読み出しは events 側、判定はこちら
  const read = await ctx.$`node events/scripts/read.mjs --name meta`
    .cwd(ctx.root)
    .nothrow()
    .quiet();
  if (read.exitCode === 0 && read.stdout.toString().trim() !== 'null') {
    let meta: unknown;
    try {
      meta = JSON.parse(read.stdout.toString());
    } catch {
      meta = null;
    }
    const findings: AuditFinding[] = auditMeta(meta);
    for (const finding of findings) errors.push(`[audit] ${finding.message}`);
  }

  return { errors };
};
