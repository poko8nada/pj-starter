// プラグイン入力型の共有定義。各フック（checks / edit-gate / event-compact）が
// Parameters<Plugin>[0] を個別に書く代わりに参照する
import type { Plugin } from '@opencode-ai/plugin';

export type PluginInput = Parameters<Plugin>[0];
