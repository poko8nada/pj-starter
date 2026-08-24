// フック結果（Report）をプロンプト本文へ連結する。エラーメッセージは各
// ハンドラーが整形済みで持ち、ここでは順序を保って連結し、空なら null を返すだけ
import type { Report } from './report';

export const buildIdleMessage = (...reports: Report[]): string | null => {
  const errors = reports.flatMap((report) => report.errors);
  if (errors.length === 0) return null;
  return `[auto-check] Automated checks failed after your edits. Fix these issues:\n\n${errors.join(
    '\n\n',
  )}`;
};
