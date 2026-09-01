# Motion Principles

スクロールトリガーとインタラクションの原則、ライブラリ選定、パフォーマンスガードレール。

## Scroll Trigger Principles

- 「動きのための動き」を避ける：動きがコンテンツの理解を助ける場合のみ使う
- スクロールトリガーのデフォルトタイミング：要素がビューポートに入ったら発火
- 遅延は `0.1s` 単位、長すぎる遅延は離脱を招く
- 繰り返しは基本オフ：一度表示したらそのまま（`whileInView` + `initial` の組み合わせ）

## Interaction Principles

- ホバー/フォーカス/アクティブの3状態を考慮
- トランジション時間：`150-300ms`（それ以上は遅延に感じる）
- イージング：`ease-out` を基本（入りは加速、抜けは減速）
- クリックフィードバックは必須：視覚的な反応がない操作は「効いていない」と誤解される

## Library Selection

### Default: Motion (motion.dev)

- React: `motion/react` → `<motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>`
- Vanilla: `motion` → `animate(element, { opacity: 1 })`
- スクロールトリガー：`inView()` 関数（vanilla）/ `whileInView` prop（React）
- 宣言的で簡潔、React/Vanilla 両対応のためデフォルト

### Lightweight fallback: CSS only

- `animation-timeline: scroll()` で依存ゼロのスクロール連動アニメーション
- 対応ブラウザ（Chrome 115+）なら追加 JS 不要
- 単純なフェードイン/スライドインは CSS で十分

### Escalation: GSAP

- Motion で表現できない複雑なタイムライン制御が必要な場合
- SVG モーフィング、複数要素の連動シーケンス、スクラブ制御
- バンドルサイズ増大は許容条件で判断

### Selection priority

```
CSS only → Motion → GSAP
（依存ゼロを優先、足りない時だけ重いライブラリ）
```

## Performance Guardrails

- 60fps を崩さない：`transform` と `opacity` のみをアニメート（layout をトリガーしない）
- `will-change` は必要な要素にのみ、アニメーション終了後に解除
- `prefers-reduced-motion: reduce` の場合はモーションを無効化
- 同時アニメーションは要素5つ以内を目安
- Intersection Observer の `threshold` は `0.1` を基本（0だと発火が遅い）
