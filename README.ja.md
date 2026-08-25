[English](./README.md) | 日本語

# Project Starter

![Node.js](https://img.shields.io/badge/node-22%2B-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-%5E6.0-blue)
![pnpm](https://img.shields.io/badge/pnpm-11%2B-orange)

プロダクト駆動開発のためのプロジェクトスターター。コピーして、プロダクト定義を自分のものに置き換えるだけで始められます。

## 説明

このリポジトリは、プロジェクトの状態をイベントログで駆動する方式の出発点です。プロダクト定義(名前・スタック・機能・ロードマップ)は [events/](./events/README.md) 配下に追記専用の事実として置かれ、このREADMEのような文書も手作業ではなくそこから生成されます。

スターター一式を新しいプロジェクトにコピーし、同梱のプロダクト定義を自分のものに書き換えてください。pre-commit の品質ゲート(lefthook による format / lint / typecheck)は最初から組み込み済みです。

## インストール

```bash
pnpm install
```

Gitフックは `prepare` スクリプトにより自動でインストールされます。

## 使い方

品質ゲートの実行:

```bash
pnpm lint
pnpm typecheck
pnpm test:run
```

クリーンなチェックアウト直後なら3つとも通るはずです。

現在のプロダクト定義の読み取り — 駆動方式の基本ループです:

```bash
node events/scripts/read.mjs --name product
```

期待される出力(要約):

```json
{"name":{"value":"Project Starter","status":{...}},"what":{"value":"…"}, ...}
```

駆動方式そのものの仕様は [events/README.md](./events/README.md) を参照してください。

## コントリビューション

個人用のスターターテンプレートのため、現在はコントリビューションガイドを設けていません。

## ライセンス

<!-- TODO: LICENSEファイルを追加したらこのセクションを更新する -->

ライセンスはまだ未指定です。

AIコーディングの手順は [AGENTS.md](./AGENTS.md) を参照してください。
