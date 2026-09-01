# Static Visual Principles

スタティックなビジュアル要素の選定原則と実装パターン。

## Color

- 没個性を避ける：デフォルトの青/黒/灰だけで済ませない
- プロダクトの個性を表すアクセントカラーを1つ決め、他は中立色で組む
- Tailwind の `@theme {}` でトークン化し、マジックナンバーを排除
- コントラスト比は WCAG AA 以上を最低基準とする

## Typography

- フォント選定の優先順位：
  1. プロダクトの特性に合った書体を選ぶ（幾何的→モノセリフ、有機的→セリフ）
  2. 英数と和書の両方が存在する場合、ペアリングを検討
  3. 最終手段として Inter / Noto Sans JP にフォールバック
- フォントサイズは Tailwind の `text-*` トークンを基本とし、必要に応じてカスタムトークン追加
- 行間（leading）は可読性重視：本文 `leading-relaxed` 以上、見出し `leading-tight`

## Font

- 配信：Google Fonts `<link>` タグ（`<head>` に先行読み込み）
- フォールバック戦略：`font-family: 'Custom', 'Noto Sans JP', system-ui, sans-serif`
- 表示時の FOIT/FOUT 対策：`font-display: swap` をデフォルトとする

## Icon

- React 環境：`lucide-react`（軽量、統一感あり）
- 素の HTML：Iconify CDN + `<iconify-icon>` 要素
- アイコンサイズはテキストに合わせる：`w-4 h-4`（`text-base` 相当）を基本単位

## Tailwind

- スタイリングは Tailwind ユーティリティクラスが基本
- カスタム値が必要な場合は `@theme {}` にトークン定義
- バージョン：v4（`@import "tailwindcss"` 方式）
- 複雑なコンポーネントは `@apply` ではなくコンポーネント側でクラスを結合

## Layout

- コンテナ幅：`max-w-7xl`（1280px）を標準、狭い画面は `max-w-4xl`
- グリッド：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` のレスパンシブパターン
- セクション余白：`py-16 md:py-24` を基本単位
- 横余白：`px-4 sm:px-6 lg:px-8` の共通パターン

## Component Patterns

- ボタン：`rounded-lg` + `font-medium` + `transition-colors`
- カード：`rounded-xl` + `border` + `shadow-sm`（必要に応じて `hover:shadow-md`）
- 入力欄：`rounded-md` + `border` + `focus:ring-2` + `focus:ring-offset-2`
- 各コンポーネントはバリアント（size, color）をプロパティで切り替え
