// フックランタイム： ターン完了時（session.idle）の整備。
// 品質レビュー → events 同期 → ターンサマリ記録 の順序をここで保証する。
// 各ハンドラーは整形済みのエラーメッセージの配列（Report）を返し、ここで連結して 1 枚のプロンプト本文を作って修正ターンを起動する。
// root は events/ を持つパスを resolveProjectRoot で解決した値を使う（worktree が "/" に化ける環境差の吸収）
import type { Plugin } from '@opencode-ai/plugin';
import { reviewIdle } from '../lib/checks/idle-review.hook';
import { buildIdleMessage } from '../lib/utils/message';
import { syncEvents } from '../lib/events-sync/sync.hook';
import { emitTurnSummary } from '../lib/turn-summary/emit.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';

export const SessionIdlePlugin: Plugin = async ({ client, $, worktree, directory }) => ({
  event: async ({ event }) => {
    if (event.type !== 'session.idle') return;
    const sessionId = event.properties.sessionID;
    const root = resolveProjectRoot({ worktree, directory });
    const review = await reviewIdle({ client, $, root }, sessionId);
    const sync = await syncEvents({ $, root });
    await emitTurnSummary({ client, $, root }, sessionId);
    const text = buildIdleMessage(review, sync);
    if (text === null) return;
    await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text }] },
    });
  },
});
