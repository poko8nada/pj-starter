// ターン完了時の品質整備。編集があったターンに限り lint --fix と typecheck を実行し、
// 残った問題をエージェント自身の修正ターンへ還流する。
// 監査の結果そのものはログに残さず、この会話的なサイクルで処理する
import type { Plugin } from '@opencode-ai/plugin';
import type { Report } from '../utils/report';
import { consumeDirty } from './edit-lint.hook';
import { createRounds, MAX_AUTO_FIX_ROUNDS } from './rounds';
import { clipLines, MAX_REPORT_LINES } from '../utils/text';

type PluginInput = Parameters<Plugin>[0];

export interface ReviewCtx {
  client: PluginInput['client'];
  $: PluginInput['$'];
  root: string;
}

const rounds = createRounds();

export const reviewIdle = async (ctx: ReviewCtx, sessionId: string): Promise<Report> => {
  if (!consumeDirty()) return { errors: [] };

  const fix = await ctx.$`pnpm exec oxlint --fix`.cwd(ctx.root).nothrow().quiet();
  const tsc = await ctx.$`pnpm exec tsc --noEmit`.cwd(ctx.root).nothrow().quiet();

  const errors: string[] = [];
  if (fix.exitCode !== 0) {
    const report = clipLines(
      `${fix.stdout.toString()}\n${fix.stderr.toString()}`,
      MAX_REPORT_LINES,
    );
    errors.push(`[lint] issues that --fix could not resolve:\n${report}`);
  }
  if (tsc.exitCode !== 0)
    errors.push(
      `[typecheck] tsc found errors:\n${clipLines(tsc.stdout.toString(), MAX_REPORT_LINES)}`,
    );

  if (errors.length === 0) {
    rounds.reset(sessionId);
    return { errors };
  }

  if (rounds.exhausted(sessionId)) {
    try {
      await ctx.client.tui.showToast({
        body: {
          title: 'auto-check',
          message: `Automatic fixes failed ${MAX_AUTO_FIX_ROUNDS} times; please check manually`,
          variant: 'error',
        },
      });
    } catch {
      // TUI 以外の実行環境では通知先がないため無視する
    }
    return { errors };
  }
  rounds.advance(sessionId);

  // ラウンド数ヒントを込めたプロンプトは plugin 直下で組み立てる。errors だけを返す
  return { errors };
};
