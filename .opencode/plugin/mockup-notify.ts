// フックランタイム： mockupワークベンチの annotations.jsonl を監視する。
// notifyレコード（起床トリガー）を検知したら、最後に活動したセッションへ未解決指示のまとめを prompt として送る。送信ボタンは記録のみで起きないため、「指示をまとめて書いてから起こす」運用をここで実現する
// root は resolveProjectRoot 経由で events/ を持つパスに正規化される。
// worktree / directory はファクトリ引数のクロージャ値で不変だが、events/ 出現タイミングや process.cwd() の変化に対する耐性のため wake() の度に再解決する。
// watch() 自体はプラグイン起動時に一度だけ張られるため、監視対象ディレクトリ自体は固定される点に注意
import { readFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import { resolveProjectRoot } from '../lib/harness/resolve-root';

interface AnnotationRecord {
  ts?: string;
  type?: string;
  target?: string;
  text?: string;
  resolved?: boolean;
}

const WORKBENCH = '.opencode/skills/mockup/workbench';
const DEBOUNCE_MS = 300;

const parseRecord = (line: string): AnnotationRecord | null => {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null) return null;
    return value;
  } catch {
    return null;
  }
};

const annotationsPath = (worktree: string | undefined, directory: string | undefined): string =>
  join(resolveProjectRoot({ worktree, directory }), WORKBENCH, 'annotations.jsonl');

export const MockupNotifyPlugin: Plugin = async ({ client, worktree, directory }) => {
  let lastSessionId = '';
  let processedNotifyTs = '';
  // タイマーハンドルの型環境差（Node/DOM/Bun）を吸収するためオブジェクトで包む
  let timer: { id: ReturnType<typeof setTimeout> } | null = null;

  const readRecords = (file: string): AnnotationRecord[] => {
    try {
      const raw = readFileSync(file, 'utf8').trim();
      if (raw === '') return [];
      return raw
        .split('\n')
        .map(parseRecord)
        .filter((r): r is AnnotationRecord => r !== null);
    } catch {
      // ファイル未作成・書き込み途中は監視対象外として無視する
      return [];
    }
  };

  const wake = async (): Promise<void> => {
    if (lastSessionId === '') return;
    const file = annotationsPath(worktree, directory);
    const records = readRecords(file);
    const last = records.at(-1);
    if (!last || last.type !== 'notify' || last.ts === processedNotifyTs) return;
    processedNotifyTs = last.ts ?? '';

    const pending = records.filter((r) => r.type === undefined && r.resolved !== true && r.text);
    if (pending.length === 0) return;
    const lines = pending.map((r) => `- ${r.target}: ${r.text}`);
    const text = [
      `mockupに新しい指示が${pending.length}件あります。対応してください:`,
      ...lines,
      '',
      '対応後は workbench/annotations.jsonl の該当レコードを resolved: true に更新し、',
      '確定なら pnpm build と product.look.mockups への登録・更新まで行ってください。',
    ].join('\n');

    await client.session.prompt({
      path: { id: lastSessionId },
      body: { parts: [{ type: 'text', text }] },
    });
  };

  try {
    watch(dirname(annotationsPath(worktree, directory)), () => {
      if (timer !== null) clearTimeout(timer.id);
      timer = {
        id: setTimeout(() => {
          void wake().catch((error: unknown) => {
            // 起床失敗は観測可能にする。握り潰さない
            console.error('[mockup-notify] wake failed:', error);
          });
        }, DEBOUNCE_MS),
      };
    });
  } catch (error) {
    // workbench 不在など監視不能でもプラグイン起動ごと落とさない
    console.error('[mockup-notify] failed to watch annotations.jsonl:', error);
  }

  return {
    event: async ({ event }) => {
      // セッションIDはイベントから拾う。起床対象は「最後に活動したセッション」
      const props: unknown = event.properties;
      if (props !== null && typeof props === 'object' && 'sessionID' in props) {
        const id = (props as { sessionID?: unknown }).sessionID;
        if (typeof id === 'string' && id !== '') lastSessionId = id;
      }
    },
  };
};
