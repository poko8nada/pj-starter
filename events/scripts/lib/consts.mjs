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

// 表示順の正本（schema.md の表順を写す）。書き出し整形のみに使い、畳み込みや検証の意味論は変えない
// 未知キーは末尾にアルファベット順で足す。配列の中身は一切並べ替えない
export const PRODUCT_ORDER = ['name', 'what', 'stack', 'look', 'features', 'roadmap', 'deploy'];
export const META_ORDER = ['harness', 'agents', 'skills', 'docs', 'scripts'];
// 下位層の順序（骨格は任意順、中身は自動整列のハイブリッド）
export const STACK_ORDER = [
  'runtime',
  'language',
  'framework',
  'frontend',
  'backend',
  'data',
  'testing',
  'build',
  'observability',
  'content',
  'libraries',
  'helpers',
  'status',
  'updatedAt',
];
export const FACT_LEAF_ORDER = ['value', 'status', 'updatedAt'];
export const LOOK_ORDER = [
  'keywords',
  'motion',
  'density',
  'concepts',
  'mockups',
  'status',
  'updatedAt',
];
export const FEATURE_LEAF_ORDER = ['trigger', 'result', 'route', 'status', 'updatedAt'];
export const ROADMAP_ORDER = ['mvp', 'v1', 'status', 'updatedAt'];
export const DEPLOY_ORDER = ['target', 'method', 'pipeline', 'environments', 'status', 'updatedAt'];
export const META_COMPONENT_ORDER = ['path', 'purpose', 'status', 'updatedAt'];
export const WHY_LEAF_ORDER = ['why', 'whyNot'];
export const STATUS_ORDER = ['stage', 'text'];
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
