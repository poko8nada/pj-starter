# scripts/user — ユーザー手動ツール

- このディレクトリは**ユーザーがシェルから直接実行する**メンテナンスツール専用。
- **エージェントは実行しないこと**（初期化は状態を消す破壊的操作のため）。

## starter:reset — コピー先プロジェクトの初期化

スターターをコピーして新プロジェクトを始めるときに、一度だけ実行する。

```bash
pnpm starter:reset                  # dry-run: 実行計画の表示のみ
pnpm starter:reset --run            # 実行（名前はプレースホルダ）
pnpm starter:reset --run "My Project"  # 実行（名前を指定）
```

やること:

1. 現状態をフォールドし、`meta.*` 定義と `product.stack` を初期状態として設定
2. `events/checkpoint.json` とルート README 2種（README.md / README.ja.md）を削除
3. `log.jsonl` を空にし、checkpoint へ「status / updatedAt を全て除去したベースライン」を書き込む
4. `product.name.value` と `product.what.value` の 2 イベントをアペンドし、build で再生成

実行後:

- `product.*` = プロジェクトの初期段階を表す。
- `meta.*` = 初期状態のハーネス。

## starter:sync — ハーネスのスターターへの取り込み

プロジェクト内でスキルやプラグインを更新した場合、それをスターターへ同期する際に実行する。

```bash
pnpm starter:sync <スターターのパス>        # dry-run プレビュー
pnpm starter:sync --run <スターターのパス>  # 実コピー
```

- 対象は固定リスト（`.opencode/`、`scripts/`、`AGENTS.md`、`lefthook.yaml`、`events/README.md`、`events/spec/`、`events/scripts/`）の丸ごとコピー。選別ロジックなし
- 加えて、プロジェクトの `events/log.jsonl` から `meta.*` イベントを抽出し、**キー単位の ts 比較**でスターターのログへ注入する:
  - プロジェクトがスターターより新しいイベントのみ注入。状態を変えないもの（no-op）は除外
  - スターター側でログに触れていない checkpoint 由来のキーは `compactedAt` を比較基準とし、未存在キーは常にプロジェクト勝ち
  - スターターに `log.jsonl` が無い場合（compact 直後など）は空ログとして扱う
  - 元の ts を保持したまま追記し、注入後にスターター側の `build` を自動実行して `meta.json` を更新する
- dry-run ではイベントごとの勝敗判定（`INJECT` / `SKIP`）を表示する。`product.*` と `log.turn.*` は注入対象外
- lock ファイル（package-lock.json / pnpm-lock.yaml）は生成物なので対象外。package.json を同期したら、スターター側の次回 opencode 起動で依存が解決される
- 不要な変更や未完成の変更は、コピー後に手動で restore などで戻す
- 取り込んだ後の状態の記録（status → build → commit）は、スターター側の通常フローで行う
