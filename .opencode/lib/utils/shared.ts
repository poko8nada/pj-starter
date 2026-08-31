import type { Plugin } from '@opencode-ai/plugin';

export interface Report {
  errors: string[];
}

export type PluginInput = Parameters<Plugin>[0];

const EDIT_TOOLS = new Set(['edit', 'write']);

export const isEditTool = (tool: string): boolean => EDIT_TOOLS.has(tool);
