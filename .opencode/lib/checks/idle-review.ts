// ターン完了時の品質整備。編集があったターンに限り lint --fix と typecheck を実行し、
// 残った問題をエージェント自身の修正ターンへ還流する。
// 監査の結果そのものはログに残さず、この会話的なサイクルで処理する
import type { Plugin } from '@opencode-ai/plugin';
import { consumeDirty } from './edit-lint';
import { createRounds, MAX_AUTO_FIX_ROUNDS } from './rounds';
import { clipLines } from './text';

type PluginInput = Parameters<Plugin>[0];

export interface ReviewCtx {
  client: PluginInput['client'];
  $: PluginInput['$'];
  root: string;
}

const MAX_REPORT_LINES = 20;
const rounds = createRounds();

export const reviewIdle = async (ctx: ReviewCtx, sessionId: string): Promise<void> => {
  if (!consumeDirty()) return;

  const fix = await ctx.$`pnpm exec oxlint --fix`.cwd(ctx.root).nothrow().quiet();
  const tsc = await ctx.$`pnpm exec tsc --noEmit`.cwd(ctx.root).nothrow().quiet();

  const problems: string[] = [];
  if (fix.exitCode !== 0) {
    const report = clipLines(
      `${fix.stdout.toString()}\n${fix.stderr.toString()}`,
      MAX_REPORT_LINES,
    );
    problems.push(`[lint] issues that --fix could not resolve:\n${report}`);
  }
  if (tsc.exitCode !== 0)
    problems.push(
      `[typecheck] tsc found errors:\n${clipLines(tsc.stdout.toString(), MAX_REPORT_LINES)}`,
    );

  // 全て通過したらラウンドカウンタをリセットして終了
  if (problems.length === 0) {
    rounds.reset(sessionId);
    return;
  }

  // 上限に達していたら自動修正をやめて人間へ通知する
  if (rounds.exhausted(sessionId)) {
    try {
      await ctx.client.tui.showToast({
        body: {
          title: 'auto-check',
          message: `自動修正が${MAX_AUTO_FIX_ROUNDS}回失敗しました。手動で確認してください`,
          variant: 'error',
        },
      });
    } catch {
      // TUI 以外の実行環境では通知先がないため無視する
    }
    return;
  }
  rounds.advance(sessionId);

  // 失敗したチェックの内容を本文に埋め込んで、修正ターンを直接起動する
  const text = [
    `[auto-check] Automated checks failed after your edits (${rounds.next(sessionId)}/${MAX_AUTO_FIX_ROUNDS}). Fix these issues:`,
    ...problems,
  ].join('\n\n');
  await ctx.client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text }] },
  });
};
