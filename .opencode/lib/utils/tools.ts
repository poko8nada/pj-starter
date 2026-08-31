// ツール種別の共有判定。edit/write は「状態を変更する編集系ツール」として
// ゲート（edit-gate）と lint（edit-lint）の両方から参照される単一の定義
const EDIT_TOOLS = new Set(['edit', 'write']);

export const isEditTool = (tool: string): boolean => EDIT_TOOLS.has(tool);
