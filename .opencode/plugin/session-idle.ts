// フックランタイム： ターン完了時（session.idle）の整備。
// 品質レビュー → events 同期の順序をここで保証する。
// 各ハンドラーは整形済みのエラーメッセージの配列（Report）を返し、
// ここで連結して 1 枚のプロンプト本文を作って修正ターンを起動する
import type { Plugin } from '@opencode-ai/plugin';
import { reviewIdle } from '../lib/checks/idle-review.hook';
import { buildIdleMessage } from '../lib/utils/message';
import { syncEvents } from '../lib/events-sync/sync.hook';

export const SessionIdlePlugin: Plugin = async ({ client, $, worktree }) => ({
  event: async ({ event }) => {
    if (event.type !== 'session.idle') return;
    const sessionId = event.properties.sessionID;
    const review = await reviewIdle({ client, $, root: worktree }, sessionId);
    const sync = await syncEvents({ $, root: worktree });
    const text = buildIdleMessage(review, sync);
    if (text === null) return;
    await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text }] },
    });
  },
});
