import type { Report, PluginInput } from '../utils/shared';
import { consumeDirty } from './edit-lint.hook';
import { createRounds, MAX_AUTO_FIX_ROUNDS } from './rounds';
import { clipLines, MAX_REPORT_LINES } from '../utils/text';

export interface ReviewCtx {
  client: PluginInput['client'];
  $: PluginInput['$'];
  root: string;
}

const rounds = createRounds();

interface CheckResult {
  exitCode: number;
  stdout: { toString(): string };
  stderr: { toString(): string };
}

const runChecks = async (
  $: PluginInput['$'],
  root: string,
): Promise<{ fix: CheckResult; tsc: CheckResult }> => {
  const fix = await $`pnpm exec oxlint --fix --deny-warnings`.cwd(root).nothrow().quiet();
  const tsc = await $`pnpm exec tsc --noEmit`.cwd(root).nothrow().quiet();
  return { fix, tsc };
};

const formatErrors = (fix: CheckResult, tsc: CheckResult): string[] => {
  const errors: string[] = [];
  if (fix.exitCode !== 0) {
    const report = clipLines(
      `${fix.stdout.toString()}\n${fix.stderr.toString()}`,
      MAX_REPORT_LINES,
    );
    errors.push(`[lint] issues that --fix could not resolve:\n${report}`);
  }
  if (tsc.exitCode !== 0) {
    errors.push(
      `[typecheck] tsc found errors:\n${clipLines(tsc.stdout.toString(), MAX_REPORT_LINES)}`,
    );
  }
  return errors;
};

export const reviewIdle = async (ctx: ReviewCtx, sessionId: string): Promise<Report> => {
  if (!consumeDirty()) return { errors: [] };

  const { fix, tsc } = await runChecks(ctx.$, ctx.root);
  const errors = formatErrors(fix, tsc);

  if (errors.length === 0) {
    rounds.reset(sessionId);
    return { errors };
  }

  if (rounds.exhausted(sessionId)) {
    try {
      await ctx.client.tui.showToast({
        body: {
          title: 'auto-check',
          message: `Automatic fixes failed ${MAX_AUTO_FIX_ROUNDS} times; please check manually`,
          variant: 'error',
        },
      });
    } catch {
      // TUI 以外の実行環境では通知先がないため無視する
    }
    return { errors };
  }
  rounds.advance(sessionId);

  return { errors };
};
