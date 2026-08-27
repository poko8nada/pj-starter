// フック結果（Report）をプロンプト本文へ連結する。エラーメッセージは各ハンドラーが整形済みで持ち、
// ここでは prefix を付けて順序を保って連結し、空なら null を返すだけ。
// prefix は省略可能（空なら body のみ。エラー内にタグを持つ Report 向け）
import type { Report } from './report';

export function buildMessage(prefix: string, ...reports: Report[]): string | null;
export function buildMessage(...reports: Report[]): string | null;
export function buildMessage(
  prefixOrReport: string | Report | undefined,
  ...reports: Report[]
): string | null {
  const prefix = typeof prefixOrReport === 'string' ? prefixOrReport : '';
  const all: Report[] =
    typeof prefixOrReport === 'string'
      ? reports
      : [prefixOrReport, ...reports].filter((r): r is Report => r !== undefined);
  const errors = all.flatMap((report) => report.errors);
  if (errors.length === 0) return null;
  const body = errors.join('\n\n');
  return prefix === '' ? body : `${prefix}\n\n${body}`;
}
