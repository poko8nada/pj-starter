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

## starter:sync — ハーネスのスターターとの双方向同期

プロジェクトとスターターの間でハーネスを双方向同期する際に実行する。

```bash
pnpm starter:sync <スターターのパス>        # dry-run プレビュー
pnpm starter:sync --run <スターターのパス>  # 実コピー
```

### ファイル同期（rclone bisync）

- 同期単位は静的定義（`sync-to-starter.mjs` の `SYNC_UNITS`）: harness（`.opencode/lib` + `.opencode/plugin`）/ agents（`.opencode/agent`）/ skills（`.opencode/skills`）/ config（`.opencode` ルートの設定ファイル）/ scripts / events（状態ファイルを除外）/ docs（`AGENTS.md` + `lefthook.yaml`）
- 双方向同期で、コンフリクト（両側で変更）は `.conflict` サフィックス付きで両バージョンが保持される（rclone の既定動作）。手動解決が必要
- 状態は OS のキャッシュディレクトリに置かれ（rclone の既定動作）、リポジトリにはファイルを追加しない
- 初回（状態なし）は `--resync --resync-mode newer` で自動再試行する
- 追跡ファイル全件が変更されると安全 abort する（稀。変更内容を確認して手動解決）
- 除外: `COMMON_EXCLUDES`（`sync-files.mjs` 参照）+ events 状態ファイル（`log.jsonl` / `checkpoint.json` / `snapshots/`）

### meta.* ログのフロー（コミット済みのみ双方向）

- **コミット済み**コンポーネントのイベントのみが双方向へ流れる:
  - プロジェクト → スターター: 勝者イベントをスターターのログへ注入（スターターの履歴は消さない）
  - スターター → プロジェクト: 定義（path/purpose）がプロジェクトのベースラインへ入る（raw）
- **非コミット**（planned / ready / implement）はホーム側に留まる。プロジェクトの進行中作業はプロジェクトのログに残る
- ファイル同期は stage 非依存（非コミットのファイルも流れる）。メタ記録との非対称は許容し、不要なら手動で restore する

### プロジェクト側のストリップ（reset と同様）

- シンクの最後に、プロジェクトの checkpoint を「コミット済み在庫（status/updatedAt を除去した定義のみ）+ 折りたたみ済み product」で書き換える
- プロジェクトのログからコミット済みコンポーネントのイベントを除去し、非コミットのイベント（+ `product.*` / `log.try.*`）だけを残す
- 履歴はスターター側が保持する。プロジェクトのメタは「最新ハーネスの在庫」として読める
- 不要な変更や未完成の変更は、コピー後に手動で restore などで戻す
- 取り込んだ後の状態の記録（status → build → commit）は、スターター側の通常フローで行う
