// ターンサマリの記録。メッセージ履歴を圧縮し、log.turn.<id> として1行追記する。
// 親を持つセッション(=サブエージェント実行)は収集対象外。
// どの失敗も痕跡1行の欠落に留め、ターン整備の流れ自体は止めない
import type { Plugin } from '@opencode-ai/plugin';
import { compressTurn, currentTurnMessages, isNotable } from './summary';

type PluginInput = Parameters<Plugin>[0];

export interface EmitCtx {
  client: PluginInput['client'];
  $: PluginInput['$'];
  root: string;
}

export const emitTurnSummary = async (ctx: EmitCtx, sessionId: string): Promise<void> => {
  try {
    const session = await ctx.client.session.get({ path: { id: sessionId } });
    if (session.data?.parentID) return;

    const messages = await ctx.client.session.messages({ path: { id: sessionId } });
    if (!messages.data) return;
    const summary = compressTurn(currentTurnMessages(messages.data), ctx.root);
    if (!isNotable(summary)) return;
    const key = `log.turn.${crypto.randomUUID().slice(0, 8)}`;

    await ctx.$`node events/scripts/append.mjs --set ${key} ${JSON.stringify(summary)}`
      .cwd(ctx.root)
      .nothrow()
      .quiet();
  } catch {
    // SDK 失敗や検証エラーもベストエフォート。次のターンでまた試される
  }
};
