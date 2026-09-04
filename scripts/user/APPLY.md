# scripts/user — ユーザー手動ツール

- このディレクトリは**ユーザーがシェルから直接実行する**メンテナンスツール専用。
- **エージェントは実行しないこと**（適用・初期化は状態を変える操作のため）。

## apply — スターターをプロジェクトへ一方向適用

プロジェクト内で実行し、スターターのハーネス一式（`.opencode/` 配下・scripts・events・AGENTS.md 等）をプロジェクトへ反映する。純 Node 実装（外部ツール不要）。

```bash
pnpm apply <スターターのパス>               # dry-run プレビュー
pnpm apply --run <スターターのパス>          # 実行（ミラー + meta 置換）
```

### ファイルミラー（一方向）

- 同期単位はグループ定義（`groups.mjs` の `GROUPS`）が正本。apply が対象にするのは tools に `apply` を含む群: harness（`.opencode/lib` + `.opencode/plugin`）/ agents（`.opencode/agent`）/ skills（`.opencode/skills`）/ config（`.opencode` の tsconfig.json・package.json・.gitignore）/ scripts（`new` 関連を除外）/ events（状態ファイルを除外）/ docs（`AGENTS.md` + `lefthook.yaml` + `.gitattributes`）/ lint（`.oxlintrc.json`・`.oxfmtrc.json`）
- 適用先では merge driver を手動登録する: `pnpm setup:merge-driver`（各cloneで一度だけ）
- **スターターが正**: スターターに無いプロジェクト側ファイルは削除される（単位内のみ）
- 比較は mtime/size。コピー時に mtime を保持するため、再実行は冪等（差分ゼロ）
- 除外: `COMMON_EXCLUDES`（`node_modules/` / `.DS_Store` / ロックファイル）+ events 状態ファイル（`log.jsonl` / `checkpoint.json` / `snapshots/`）。これらは削除・上書きされない。ディレクトリ除外（`node_modules/` 等）は任意深度のセグメント一致で効く

### meta.* の適用

- プロジェクトの meta を**スターターのコミット済み在庫**（status/updatedAt を除去した定義のみ）で丸ごと置換する
- プロジェクトのログからコミット済み meta イベントを除去し、非コミット（ready/implement）+ `product.*` + `log.try.*` は残す
- 履歴はスターター側が保持する。プロジェクトのメタは「最新ハーネスの在庫」として読める

### 新規立ち上げ

- `node scripts/user/new.mjs` に移管した。詳しくは `NEW.md` を参照（スターター側のみに存在）
- `apply --init` は受け付けない（移管案内を出して失敗する）
