// 品質レビュー → ログコンパクション の順序をここで保証する。
// 各ハンドラーは整形済みのエラーメッセージの配列（Report）を返し、ここで連結して 1 枚のプロンプト本文を作って修正ターンを起動する。
// root は events/ を持つパスを resolveProjectRoot で解決した値を使う（worktree が "/" に化ける環境差の吸収）
import type { Plugin } from '@opencode-ai/plugin';
import { reviewIdle } from '../lib/checks/idle-review.hook';
import { buildMessage } from '../lib/utils/message';
import { compactEvents } from '../lib/event-compact/compact.hook';
import { createTrail } from '../lib/tool-trail/trail.hook';
import { resolveProjectRoot } from '../lib/harness/resolve-root';

export const SessionIdlePlugin: Plugin = async ({ client, $, worktree, directory }) => {
  const root = resolveProjectRoot({ worktree, directory });
  const trail = createTrail(root);

  return {
    event: async ({ event }) => {
      // トライルのセッション管理（サブエージェント判定・ターン境界リセット）
      trail.event(event);
      if (event.type !== 'session.idle') return;
      const sessionId = event.properties.sessionID;
      const review = await reviewIdle({ client, $, root }, sessionId);
      const compact = await compactEvents({ $, root });
      const text = buildMessage(
        '[auto-check] Automated checks failed after your edits. Fix these issues:',
        review,
        compact,
      );
      if (text === null) return;
      await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text }] },
      });
    },
  };
};
