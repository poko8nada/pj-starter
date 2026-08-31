// 名前空間とステージの語彙。駆動システムの仕様（events/README.md）に対応する定数群

// 名前空間ごとの振る舞い宣言。fold:true の名前空間だけがスナップショットに畳み込まれ、asOf 起算の対象になる。log は機械注入の痕跡専用で、build/compact の対象外
export const NAMESPACES = {
  product: { fold: true },
  meta: { fold: true },
  log: { fold: false },
};
export const PRODUCT_SECTIONS = new Set([
  'name',
  'what',
  'stack',
  'look',
  'features',
  'roadmap',
  'deploy',
]);
export const FACT_SECTIONS = new Set(['name', 'what', 'stack', 'look', 'roadmap', 'deploy']);
export const META_SECTIONS = new Set(['harness', 'agents', 'skills', 'docs', 'scripts']);
export const EVENT_TYPES = new Set(['set', 'del']);
export const STAGES = new Set(['planned', 'ready', 'implement', 'commit']);

export const LOG_TOOLS = new Set([
  'read',
  'edit',
  'write',
  'skill',
  'bash',
  'websearch',
  'webfetch',
  'task',
]);

// 未確定コンポーネント（作業単位）の抽出対象ステージ。status.stage が ready/implement のままのものを全名前空間（product/meta）から取り出す。コミット時の未確定フォローアップに使う。
export const UNRESOLVED_STAGES = new Set(['ready', 'implement']);
