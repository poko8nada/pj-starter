// 自動修正ラウンドの進行管理。セッションごとに連続失敗数を数え、上限に達したら
// 自動修正を打ち切って人間の確認へ誘導する判断のみを担う（純粋ロジック）
export const MAX_AUTO_FIX_ROUNDS = 3;

export interface Rounds {
  next: (sessionId: string) => number;
  advance: (sessionId: string) => void;
  reset: (sessionId: string) => void;
  exhausted: (sessionId: string) => boolean;
}

export const createRounds = (): Rounds => {
  const counts = new Map<string, number>();
  return {
    next: (sessionId) => counts.get(sessionId) ?? 0,
    advance: (sessionId) => counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1),
    reset: (sessionId) => counts.delete(sessionId),
    exhausted: (sessionId) => (counts.get(sessionId) ?? 0) >= MAX_AUTO_FIX_ROUNDS,
  };
};
