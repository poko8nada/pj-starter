// モックアップワークベンチのVite設定
// このディレクトリは独立ワークスペース（境界マーカー: package.json + pnpm-workspace.yaml）。
// ルートの品質ゲート・プラグインからは除外されている
import { appendFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = fileURLToPath(new URL('.', import.meta.url));

// workbench 直下の各 *.html を1モックアップとして扱う（1モックアップ = 1画面 = 1HTML）
const screenInputs = (): Record<string, string> =>
  Object.fromEntries(
    readdirSync(here)
      .filter((file) => file.endsWith('.html'))
      .map((file) => [file.replace(/\.html$/, ''), resolve(here, file)]),
  );

const appendRecord = (record: unknown): void => {
  appendFileSync(resolve(here, 'annotations.jsonl'), `${JSON.stringify(record)}\n`);
};

// エージェントへの指示の受け口。オーバーレイからのPOSTを annotations.jsonl へ追記する（dev時のみ）
const annotationsApi = (): Plugin => ({
  name: 'mockup-annotations-api',
  apply: 'serve',
  configureServer: (server) => {
    server.middlewares.use('/__annotations', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end();
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { target?: unknown; text?: unknown };
          const record = {
            ts: new Date().toISOString(),
            target: String(parsed.target ?? ''),
            text: String(parsed.text ?? ''),
            resolved: false,
          };
          appendRecord(record);
          res.statusCode = 201;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(record));
        } catch {
          res.statusCode = 400;
          res.end();
        }
      });
    });
    // 起床トリガー。notifyレコードを1行追記するだけで、監視はハーネスプラグイン側が担う
    server.middlewares.use('/__notify', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end();
      }
      appendRecord({ ts: new Date().toISOString(), type: 'notify' });
      res.statusCode = 201;
      res.end();
    });
  },
});

// オーバーレイの注入。apply:'serve' によりdev時のみ有効で、ビルド成果物には混入しない
const overlayInjector = (): Plugin => ({
  name: 'mockup-overlay-injector',
  apply: 'serve',
  transformIndexHtml: () => [
    {
      tag: 'script',
      attrs: { type: 'module', src: '/overlay/main.ts' },
      injectTo: 'body',
    },
  ],
});

export default defineConfig(({ command }) => {
  const inputs = screenInputs();
  // 画面ゼロでのビルドは rollup が暗号的なエラーを出すため、ここで意味のあるメッセージへ差し替える
  if (command === 'build' && Object.keys(inputs).length === 0)
    throw new Error(
      '[mockup] ビルド対象の画面がありません。workbench 直下に <id>.html を作成してからビルドしてください',
    );
  return {
    plugins: [tailwindcss(), viteSingleFile(), annotationsApi(), overlayInjector()],
    build: {
      rollupOptions: { input: inputs },
    },
  };
});
