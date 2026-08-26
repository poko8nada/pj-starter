// plugin 入力の worktree / directory から、events スクリプトが実行できるプロジェクトルートを 1 つに決める。優先順位は worktree → directory → cwd で、各候補について events/ ディレクトリの存在で判定する（セマンティック判定）。
// opencode 環境差で worktree が "/" に解決されても、events を持つ別候補にフォールバックできる。全候補で events が無ければ cwd を返す。
// lib/harness/ 配下に置くのは、plugin 層で横断的に必要になる「フックランタイムの前提を整える」ヘルパ群の置き場として使うため。events 同期以外のチェック系（lib/checks/）とは責務が異なる
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const EVENTS_MARKER = 'events';

export interface ResolveRootInput {
  worktree?: unknown;
  directory?: unknown;
}

const hasEvents = (candidate: string): boolean => existsSync(join(candidate, EVENTS_MARKER));

export const resolveProjectRoot = (
  input: ResolveRootInput,
  cwd: string = process.cwd(),
): string => {
  for (const candidate of [input.worktree, input.directory]) {
    if (typeof candidate !== 'string' || candidate === '') continue;
    if (hasEvents(candidate)) return candidate;
  }
  if (hasEvents(cwd)) return cwd;
  return cwd;
};
