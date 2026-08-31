import fs from 'node:fs';
import path from 'node:path';
import type { Report, PluginInput } from '../utils/shared';
import { shouldCompact } from './threshold';

export interface CompactCtx {
  $: PluginInput['$'];
  root: string;
}

export const COMPACT_FAILURE_TTL_MS = 10 * 60 * 1000;

export const compactFailureStates = new Map<string, number>();

export const countLogLines = (root: string): number => {
  const logPath = path.join(root, 'events', 'log.jsonl');
  if (!fs.existsSync(logPath)) return 0;
  const content = fs.readFileSync(logPath, 'utf8');
  if (content === '') return 0;
  return content.split('\n').filter((line) => line.trim() !== '').length;
};

export const compactEvents = async (ctx: CompactCtx): Promise<Report> => {
  const lastFailureAt = compactFailureStates.get(ctx.root);
  if (lastFailureAt !== undefined && Date.now() - lastFailureAt <= COMPACT_FAILURE_TTL_MS) {
    return { errors: [] };
  }

  const lines = countLogLines(ctx.root);
  if (!shouldCompact(lines)) {
    compactFailureStates.delete(ctx.root);
    return { errors: [] };
  }

  const result = await ctx.$`node events/scripts/compact.mjs`.cwd(ctx.root).nothrow().quiet();
  if (result.exitCode !== 0) {
    compactFailureStates.set(ctx.root, Date.now());
    return { errors: [`[events] compact failed:\n${result.stderr.toString().trim()}`] };
  }
  compactFailureStates.delete(ctx.root);
  return { errors: [] };
};
