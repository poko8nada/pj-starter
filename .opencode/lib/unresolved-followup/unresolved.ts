// 未確定コンポーネントのフォローアップ状態管理（純粋ロジック）。
// 発火は「1回だけ」で、コミット成功で復活する。edit-lint の dirtyAt と同じ作法で、状態はモジュール内のメモリ変数に持ち、fs I/O は行わない。
// メッセージ整形は read.mjs の出力文字列を受け取る（抽出ロジックは events 側の責務）

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

// read.mjs --unresolved の出力をフォローアップメッセージとして整形する。
export const buildFollowupMessage = (readOutput: string): string | null => {
  const trimmed = readOutput.trim();
  if (trimmed === '' || trimmed === 'There are no unresolved components') return null;
  return `[unresolved] Check unresolved components before committing. If you have completed implementation, commit it, and if you have not done it, record it as a withdrawal (del). You can leave it as is if you want to carry it over to the next turn.\n\n${trimmed}`;
};
