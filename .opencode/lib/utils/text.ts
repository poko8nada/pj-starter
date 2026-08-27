// 出力テキストを指定行数に丸める。プロンプト本文へ流す外部出力（lint/typecheck/build など）
// を丸めるための共通純関数
export const MAX_REPORT_LINES = 20;

export const clipLines = (text: string, max: number): string => {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length <= max) return lines.join('\n');
  return [...lines.slice(0, max), `...${lines.length - max} more lines`].join('\n');
};
