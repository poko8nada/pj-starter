// 出力テキストを指定行数に丸める。長大なツール出力の転送を防ぐための純粋関数
export const clipLines = (text: string, max: number): string => {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length <= max) return lines.join('\n');
  return [...lines.slice(0, max), `...他 ${lines.length - max} 行`].join('\n');
};
