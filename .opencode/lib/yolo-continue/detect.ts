// yolo検知の純粋関数群。副作用を持たない（HEAD取得や送信はプラグイン側の責務）。
// 展開形式の前提: "/workflow yolo" 送信で「スキル本文＋末尾行の引数 yolo」に展開される。
// 通常 "/workflow" は引数なし展開なので末尾行で区別できる。

// workflowスキル本文の目印。いずれかを含めば対象とみなす
const WORKFLOW_MARKERS = ['# Workflow', 'Yolo mode'];

// 末尾の非空行を取り出す（CR/LF差と末尾空白を吸収する）
const lastContentLine = (text: string): string => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line !== '') return line;
  }
  return '';
};

// yolo展開か: 本文目印を含み、末尾行が yolo 引数である
export const isYoloExpansion = (text: unknown): boolean => {
  if (typeof text !== 'string') return false;
  const hasMarker = WORKFLOW_MARKERS.some((marker) => text.includes(marker));
  if (!hasMarker) return false;
  return lastContentLine(text).toLowerCase() === 'yolo';
};

// 合意トークンか: 正規化後に ok / おk へ完全一致する短文だけ拾う（長文は武装維持のため除外する）
export const isAgreement = (text: unknown): boolean => {
  if (typeof text !== 'string') return false;
  const normalized = text.normalize('NFKC').toLowerCase().trim();
  return normalized === 'ok' || normalized === 'おk';
};
