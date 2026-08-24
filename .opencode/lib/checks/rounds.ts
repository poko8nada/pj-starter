// 自動修正ラウンドの進行管理。セッションごとに連続失敗数を数え、上限に達したら
// 自動修正を打ち切って人間の確認へ誘導する判断のみを担う（純粋ロジック）。
// 前回の失敗から一定時間が経過したらカウントをリセットする（強制停止後のループ防止）
export const MAX_AUTO_FIX_ROUNDS = 3;

// 前回失敗からこの時間が経過したらカウントをリセットする
export const ROUND_RESET_MS = 10 * 60 * 1000;

export interface Rounds {
  next: (sessionId: string) => number;
  advance: (sessionId: string) => void;
  reset: (sessionId: string) => void;
  exhausted: (sessionId: string) => boolean;
}

interface RoundState {
  count: number;
  lastFailureAt: number;
}

export const createRounds = (): Rounds => {
  const states = new Map<string, RoundState>();

  const get = (sessionId: string): RoundState => {
    const state = states.get(sessionId);
    if (!state) return { count: 0, lastFailureAt: 0 };
    // 前回失敗から十分経過していたらリセット扱いにする
    if (Date.now() - state.lastFailureAt > ROUND_RESET_MS)
      return { count: 0, lastFailureAt: state.lastFailureAt };
    return state;
  };

  return {
    next: (sessionId) => get(sessionId).count,
    advance: (sessionId) => {
      const state = get(sessionId);
      states.set(sessionId, { count: state.count + 1, lastFailureAt: Date.now() });
    },
    reset: (sessionId) => states.delete(sessionId),
    exhausted: (sessionId) => get(sessionId).count >= MAX_AUTO_FIX_ROUNDS,
  };
};
