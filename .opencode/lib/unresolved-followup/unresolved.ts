// 未確定コンポーネントのフォローアップ状態管理（純粋ロジック）。
// 発火は「1回だけ」で、コミット成功で復活する。edit-lint の dirtyAt と同じ作法で、状態はモジュール内のメモリ変数に持ち、fs I/O は行わない。
// 抽出は events/scripts/lib.mjs の findUnresolved が返す items 配列を受け取る（文字列出力に依存しない）

export interface FollowupState {
  fired: boolean;
}

export const createFollowup = (): FollowupState => ({ fired: false });

// 発火枠を消費する。既に発火済みなら false（スルー）を返し、未発火なら true で発火状態にする。
// 呼び出し側は「未確定が存在する」ことを確認してから呼ぶ（未確定0件で枠を消費しない）
export const tryFire = (state: FollowupState): boolean => {
  if (state.fired) return false;
  state.fired = true;
  return true;
};

// コミット成功時に呼び、次の検知に備えて発火状態を戻す
export const resetFollowup = (state: FollowupState): void => {
  state.fired = false;
};

export interface UnresolvedItem {
  name: string;
  stage: string;
  text: string;
  path?: string;
}

// findUnresolved の結果（items 配列）をフォローアップメッセージとして整形する。
// 0件なら null（発火しない）
export const buildFollowupMessage = (items: UnresolvedItem[]): string | null => {
  if (items.length === 0) return null;
  const lines = items.map(
    (item) => `- ${item.name}  (${item.path || 'no path'})  [${item.stage}]  ${item.text}`,
  );
  return `[unresolved] Check unresolved components before committing. If you have completed implementation, commit it, and if you have not done it, record it as a withdrawal (del). You can leave it as is if you want to carry it over to the next turn.\n\n未確定のコンポーネントがあります:\n${lines.join('\n')}`;
};
