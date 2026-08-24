// フックランタイム： ターン完了時（session.idle）の整備。
// 品質レビュー → events 同期の順序をここで保証する。処理の実体は lib 配下
import type { Plugin } from '@opencode-ai/plugin';
import { reviewIdle } from '../lib/checks/idle-review';
import { syncEvents } from '../lib/events-sync/sync';

export const SessionIdlePlugin: Plugin = async ({ client, $, worktree }) => ({
  event: async ({ event }) => {
    if (event.type !== 'session.idle') return;
    await reviewIdle({ client, $, root: worktree }, event.properties.sessionID);
    await syncEvents({ $, root: worktree });
  },
});
