// git 境界ヘルパ。ゲートの有効性（リポジトリ内 + 初回コミット有無）とサイクル完了（ワークツリーがクリーンか）を判定する。$ はプラグインから注入される
import type { PluginInput } from '../utils/plugin';

export interface GitCtx {
  $: PluginInput['$'];
  root: string;
}

// リポジトリ内かつ HEAD が存在する（= git が使われ始めている）場合のみ true。
// 未初期化・コミット前のプロジェクトではゲートを無効化してスルーする
export const isGitRepo = async (ctx: GitCtx): Promise<boolean> => {
  const inside = await ctx.$`git rev-parse --is-inside-work-tree`.cwd(ctx.root).nothrow().quiet();
  if (inside.exitCode !== 0) return false;
  const head = await ctx.$`git rev-parse --verify HEAD`.cwd(ctx.root).nothrow().quiet();
  return head.exitCode === 0;
};

// ワークツリーがクリーン（未コミット変更なし）の場合のみ true。
// サイクル完了の判定に使う。未追跡ファイルも含める（git status --porcelain）
export const isGitClean = async (ctx: GitCtx): Promise<boolean> => {
  const result = await ctx.$`git status --porcelain`.cwd(ctx.root).nothrow().quiet();
  return result.exitCode === 0 && result.stdout.toString().trim() === '';
};
