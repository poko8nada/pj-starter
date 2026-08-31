// git commit 実行時に未確定コンポーネントを検知し、1回だけフォローアップを注入するフック。
// 発火は「未確定が存在する場合」のみ。いずれかの git commit で1回発火したら、コミットが通る（session.idle で git クリーン）までスルーし、コミット成功で復活する。
// 抽出は events/scripts/read.mjs --unresolved に委ね、ここでは検知とメッセージ生成だけを行う。
// 直接の git commit は isCommitCommand で bash から検知する。audit / commit スキルは各自の手順で同じ read.mjs 出力を確認する（本フックの状態とは独立）
import type { Report, PluginInput } from '../utils/shared';
import { isCommitCommand } from '../tool-trail/trail';
import { isGitClean } from '../edit-gate/git.hook';
import { buildFollowupMessage, createFollowup, resetFollowup, tryFire } from './unresolved';

export interface UnresolvedCtx {
  $: PluginInput['$'];
  root: string;
}

export interface FollowupInput {
  tool: string;
  command?: unknown;
}

const state = createFollowup();

export const resetFollowupForTests = (): void => {
  resetFollowup(state);
};

// git commit 実行時に未確定があれば、1回だけフォローアップメッセージを返す。
// 未確定が存在することを確認してから発火枠を消費する（未確定0件のコミットで枠を消費しない）
export const runUnresolvedFollowup = async (
  ctx: UnresolvedCtx,
  input: FollowupInput,
): Promise<Report> => {
  if (input.tool !== 'bash' || !isCommitCommand(input.command)) return { errors: [] };

  const result = await ctx.$`node events/scripts/read.mjs --name meta --unresolved`
    .cwd(ctx.root)
    .nothrow()
    .quiet();
  if (result.exitCode !== 0) {
    return {
      errors: [
        `[unresolved] 未確定コンポーネントの確認に失敗しました:\n${result.stderr.toString().trim()}`,
      ],
    };
  }
  const message = buildFollowupMessage(result.stdout.toString());
  if (message === null) return { errors: [] };
  if (!tryFire(state)) return { errors: [] };
  return { errors: [message] };
};

// session.idle で git クリーンなら復活（コミット成功と見なす）
export const settleFollowup = async (ctx: UnresolvedCtx): Promise<void> => {
  if (await isGitClean(ctx)) resetFollowup(state);
};
