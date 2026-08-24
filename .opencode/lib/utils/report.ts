// 全ハンドラー共通の返り値型。エラーメッセージは各ハンドラーが整形済みで持ち、
// 合成側（plugin）が順序を保って連結する。エージェント向けの本文は常に英語
export interface Report {
  errors: string[];
}
