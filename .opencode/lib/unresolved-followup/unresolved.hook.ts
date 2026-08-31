// git commit 実行時に未確定コンポーネントを検知し、1回だけフォローアップを注入するフック。
// 発火は「未確定が存在する場合」のみ。いずれかの git commit で1回発火したら、コミットが通る（session.idle で git クリーン）までスルーし、コミット成功で復活する。
// 抽出は events/scripts/lib.mjs の findUnresolved を直接 import して行う（CLI の文字列出力に依存しない）。
// 直接の git commit は isCommitCommand で bash から検知する。audit / commit スキルは各自の手順で同じスナップショットを確認する（本フックの状態とは独立）
import fs from 'node:fs';
import path from 'node:path';
import type { Report, PluginInput } from '../utils/shared';
import { isCommitCommand } from '../tool-trail/trail';
import { isGitClean } from '../process-compliance/git.hook';
import { findUnresolved, NAMESPACES } from '../../../events/scripts/lib.mjs';
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

// スナップショットから未確定コンポーネントのツリーを読み込む。畳み込み対象（NAMESPACES.fold）の名前空間を対象にし、ファイル単位で失敗しても他を隠蔽しない
const loadSnapshots = (root: string): Record<string, unknown> => {
  const trees: Record<string, unknown> = {};
  for (const [name, { fold }] of Object.entries(NAMESPACES)) {
    if (!fold) continue;
    const file = path.join(root, 'events', 'snapshots', `${name}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf8')).content;
      trees[name] = content;
    } catch (err) {
      // 読めない名前空間はスキップし、他方の未確定を隠蔽しない。報告は呼び出し側（tool-execute-before）に任せる
      console.warn(`[unresolved] Failed to read snapshot ${file}: ${String(err)}`);
    }
  }
  return trees;
};

// git commit 実行時に未確定があれば、1回だけフォローアップメッセージを返す。
// 未確定が存在することを確認してから発火枠を消費する（未確定0件のコミットで枠を消費しない）
export const runUnresolvedFollowup = async (
  ctx: UnresolvedCtx,
  input: FollowupInput,
): Promise<Report> => {
  if (input.tool !== 'bash' || !isCommitCommand(input.command)) return { errors: [] };

  const trees = loadSnapshots(ctx.root);
  const items = findUnresolved(trees);
  const message = buildFollowupMessage(items);
  if (message === null) return { errors: [] };
  if (!tryFire(state)) return { errors: [] };
  return { errors: [message] };
};

// session.idle で git クリーンなら復活（コミット成功と見なす）
export const settleFollowup = async (ctx: UnresolvedCtx): Promise<void> => {
  if (await isGitClean(ctx)) resetFollowup(state);
};
