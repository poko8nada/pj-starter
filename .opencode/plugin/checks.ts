import type { Plugin } from '@opencode-ai/plugin';

// セッションあたりの自動修正ラウンド上限。超過したら toast で手動確認へ誘導する
const MAX_AUTO_FIX_ROUNDS = 3;
// プロンプトへ埋め込むエラー行数の上限。長大な出力の転送を防ぐ
const MAX_ERROR_LINES = 20;

// 出力テキストを最大 MAX_ERROR_LINES 行に丸める
const clip = (text: string): string => {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length <= MAX_ERROR_LINES) return lines.join('\n');

  return [...lines.slice(0, MAX_ERROR_LINES), `...他 ${lines.length - MAX_ERROR_LINES} 行`].join(
    '\n',
  );
};

export const ChecksPlugin: Plugin = async ({ client, $, worktree }) => {
  const root = worktree;
  // セッションIDごとの自動修正実施数。チェック全通過でリセットする
  const rounds = new Map<string, number>();
  // エージェントによるファイル編集が発生したことを示すフラグ
  let dirty = false;

  return {
    // 編集系ツールの直後に、編集ファイルへ lint（report-only）を実行して結果をツール出力に追記する。
    // --fix は使わない。エージェントの認識中の内容とディスクの乖離を避けるため
    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'edit' && input.tool !== 'write') return;

      const file = input.args?.filePath;
      if (typeof file !== 'string' || file === '') return;

      dirty = true;
      const result = await $`pnpm exec oxlint ${file}`.cwd(root).nothrow().quiet();
      if (result.exitCode === 0) return;

      const report = clip(`${result.stdout.toString()}\n${result.stderr.toString()}`);
      output.output += `\n\n[lint] oxlint detected issues:\n${report}`;
    },

    event: async ({ event }) => {
      // ターン完了時に一度だけ全体チェックを回す。編集のないターンは何もしない
      if (event.type !== 'session.idle') return;

      if (!dirty) return;

      dirty = false;

      const sessionID = event.properties.sessionID;
      // まず全体に lint --fix を適用し、その後 typecheck を実行する
      const fix = await $`pnpm exec oxlint --fix`.cwd(root).nothrow().quiet();
      const tsc = await $`pnpm exec tsc --noEmit`.cwd(root).nothrow().quiet();

      const problems: string[] = [];
      if (fix.exitCode !== 0) {
        const report = clip(`${fix.stdout.toString()}\n${fix.stderr.toString()}`);
        problems.push(`[lint] issues that --fix could not resolve:\n${report}`);
      }
      if (tsc.exitCode !== 0) {
        const report = clip(tsc.stdout.toString());
        problems.push(`[typecheck] tsc found errors:\n${report}`);
      }

      // 全て通過したらラウンドカウンタをリセットして終了
      if (problems.length === 0) {
        rounds.delete(sessionID);
        return;
      }

      // 上限に達していたら自動修正をやめて人間に通知する
      const count = rounds.get(sessionID) ?? 0;
      if (count >= MAX_AUTO_FIX_ROUNDS) {
        try {
          await client.tui.showToast({
            body: {
              title: 'auto-check',
              message: `自動修正が${MAX_AUTO_FIX_ROUNDS}回失敗しました。手動で確認してください`,
              variant: 'error',
            },
          });
        } catch {
          // TUI 以外の実行環境では通知先がないため無視する
        }
        return;
      }
      rounds.set(sessionID, count + 1);

      // 失敗したチェックの内容を本文に埋め込んで、修正ターンを直接起動する
      const text = [
        `[auto-check] Automated checks failed after your edits (${count + 1}/${MAX_AUTO_FIX_ROUNDS}). Fix these issues:`,
        ...problems,
      ].join('\n\n');
      await client.session.prompt({
        path: { id: sessionID },
        body: { parts: [{ type: 'text', text }] },
      });
    },
  };
};
