// ログ行数に対するコンパクション要否の判定。
// しきい値はフック側のポリシーとしてここに置く（events 側のスクリプトは上限を知らない）
export const COMPACTION_THRESHOLD = 1000;

export const shouldCompact = (
  lineCount: number,
  threshold: number = COMPACTION_THRESHOLD,
): boolean => lineCount >= threshold;
