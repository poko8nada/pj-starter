# new — スターターのルートで一度だけ実行する新規立ち上げ

スターターのルートで実行し、隣に新規プロジェクトを1発で作る。純 Node 実装（git / pnpm コマンドの呼び出しを除く）。

- このファイルは配布物に含めない（scripts 群の除外設定で運ばない）。
- **エージェントは実行しないこと**（状態を変える操作のため）。

```bash
node scripts/user/new.mjs <名前>                    # dry-run プレビュー
node scripts/user/new.mjs --run <名前>              # 実行（全工程）
node scripts/user/new.mjs --run --skip-install <名前>  # 工程ごとにスキップ可
node scripts/user/new.mjs --run --in <親> <名前>     # 親ディレクトリを上書き
```

- 作り先は親ディレクトリ／`<名前>`（既定は起点の親＝隣）。`<名前>` は単一のディレクトリ名のみ
- 引数なしは用法表示。名前あり・`--run` なしは dry-run プレビュー（何も変更しない）

## 工程（順次実行・失敗時は即時失敗）

1. `scaffold 複写` — `groups.mjs` で `new` タグの群を起点から対象へ運ぶ（`--skip-scaffold` で省略）
2. `git 初期化` — `git init`（`--skip-git` で省略）
3. `pnpm 導入` — `pnpm install`（`prepare` 経由で lefthook／merge-driver まで入る。`--skip-install` で省略）
4. `イベント初期化` — 対象の `checkpoint.json` と README を削除し、`log.jsonl` を空にして `product.name.value` / `product.what.value` の 2 イベントで再開。checkpoint は起点の `product.stack` + 起点のコミット済み meta 在庫で種まき（`--skip-events` で省略。`log.jsonl` がなくても動く）
5. `空 README 生成` — 空の `README.md` / `README.ja.md` を作る（中身はプロジェクト側で書く。`--skip-readme` で省略）
6. `スナップショット再生成` — 起点の `build.mjs` を対象の events に向けて実行（`--skip-build` で省略）

## 安全装置

- 対象が起点と同じ場合は拒否する（スターター自身の破壊を防止）
- 空でない対象は `--force` なしで拒否する
- コミット履歴のある `.git` は拒否する（手動で対処すること）
- 初回コミットは手動で行う（`new` の範囲外）
