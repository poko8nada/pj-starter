// ツール種別の共有判定。edit/write は「状態を変更する編集系ツール」として
// ゲート（edit-gate）と lint（edit-lint）の両方から参照される単一の定義
const EDIT_TOOLS = new Set(['edit', 'write']);

export const isEditTool = (tool: string): boolean => EDIT_TOOLS.has(tool);

// トレイル記録の対象ツール。ファイル系(read/edit/write)と skill を単一の定義で持つ。
// 型ガードとして使うことで、呼び出し側で tool の絞り込みが効く
const TRAIL_TOOLS = new Set(['read', 'edit', 'write', 'skill']);

export const isTrailTool = (tool: string): tool is 'read' | 'edit' | 'write' | 'skill' =>
  TRAIL_TOOLS.has(tool);
