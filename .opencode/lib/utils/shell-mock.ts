// テスト用の $ シェルモック。コマンド文字列 → 結果のマップで応答し、root 以外の cwd はエラーにする。
// BunShellPromise は stdin/env/quiet/lines 等 10+ メソッドを持つため、テストで完全モックするのは非現実的。
// ctx の $ は unknown で返し、呼び出し側で各フックの ctx 型へ絞る
import { vi } from 'vitest';

export type ShellResult = { exitCode: number; stdout: string | Buffer; stderr: string };

export const createShellMock = (
  results: Record<string, ShellResult>,
  root: string,
): { ctx: { $: unknown; root: string }; handler: ReturnType<typeof vi.fn> } => {
  const handler = vi.fn();
  handler.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const cmd = strings.reduce(
      (acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''),
      '',
    );
    const result: ShellResult = results[cmd] ?? { exitCode: 0, stdout: '', stderr: '' };
    const stub = {
      cwd: (cwdDir: string) => {
        if (cwdDir !== root) throw new Error(`unexpected cwd: ${cwdDir}`);
        return {
          nothrow: () => ({
            quiet: () => Promise.resolve(result),
          }),
        };
      },
    };
    return stub;
  });
  return { ctx: { $: handler, root }, handler };
};
