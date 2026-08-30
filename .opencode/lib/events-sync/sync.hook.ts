// ターン完了時の events 同期。build/compact 失敗が TTL 内なら再実行せず空 Report を返し、session.idle → build.mjs 失敗 → prompt 再注入のループを断つ。
// root ごとに抑止状態を分離し、audit 由来はトリガーに含めない（TTL 中は audit 自体も走らない点に注意）
import { auditMeta, type AuditFinding } from './audit';
import type { Report } from '../utils/report';
import type { PluginInput } from '../utils/plugin';
import { shouldCompact } from './threshold';

export interface SyncCtx {
  $: PluginInput['$'];
  root: string;
}

// 失敗後この時間内は events 系を実行しない。rounds.ts の ROUND_RESET_MS と揃える
export const SYNC_FAILURE_TTL_MS = 10 * 60 * 1000;

// root ごとの最終失敗時刻。テストから beforeEach で reset するため export
export const syncFailureStates = new Map<string, number>();

export const syncEvents = async (ctx: SyncCtx): Promise<Report> => {
  const lastFailureAt = syncFailureStates.get(ctx.root);
  if (lastFailureAt !== undefined && Date.now() - lastFailureAt <= SYNC_FAILURE_TTL_MS)
    return { errors: [] };

  const errors: string[] = [];
  let syncFailed = false;

  const runScript = async (name: 'compact' | 'build'): Promise<void> => {
    const result = await ctx.$`node events/scripts/${name}.mjs`.cwd(ctx.root).nothrow().quiet();
    if (result.exitCode !== 0) {
      errors.push(`[events] ${name} failed:\n${result.stderr.toString().trim()}`);
      syncFailed = true;
    }
  };

  const wc = await ctx.$`wc -l events/log.jsonl`.cwd(ctx.root).nothrow().quiet();
  const lines = Number.parseInt(wc.stdout.toString().trim(), 10);
  if (shouldCompact(Number.isNaN(lines) ? 0 : lines)) await runScript('compact');
  await runScript('build');

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

  if (syncFailed) syncFailureStates.set(ctx.root, Date.now());
  else syncFailureStates.delete(ctx.root);
  return { errors };
};
