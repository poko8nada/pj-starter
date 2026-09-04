// yolo自動継続プラグイン。二段階検知で駆動する。
// 武装: chat.message が yolo展開（スキル本文＋末尾 yolo 行）に合致したら当該セッションを武装し HEAD を記録する（この時点では送信しない）。
// 発動: 武装中に合意トークンのみの文面が来たら発動する。以後の session.idle で継続文を送る。
// 送信条件: 前回送信後に活動（ユーザー文面・ツール実行・HEAD変化）があれば送り、無ければ送らない（無為ループ防止）。
// 終了: idle 時に HEAD が進んでいれば無言解除（コミット完了）。連続上限到達でも解除する（こちらは一言添える）。
// command.execute.before は保険の聞き耳（冪等）。ユーザー文面を持たないサブエージェントは対象外になる
import type { Plugin } from '@opencode-ai/plugin';
import { isAgreement, isYoloExpansion } from '../lib/yolo-continue/detect';
import { resolveProjectRoot } from '../lib/harness/resolve-root';
import type { PluginInput } from '../lib/utils/shared';

// 連続自動継続の上限。行き詰まり時の無限ループと非git環境の終了不能を吸収する（調整可）
const MAX_CONTINUES = 30;

// 継続文。発動＝合意済みの前提で確認省略を明示し、終了条件を添える
const CONTINUE_TEXT =
  'yolo継続中：提案通り進行してください（確認は省略します）。コミット完了で自動継続を終了します。';
const CAP_TEXT =
  'yolo自動継続の上限に達したため通常モードに戻します。続ける場合は指示してください。';

type Hooks = Awaited<ReturnType<Plugin>>;
type CommandInput = Parameters<NonNullable<Hooks['command.execute.before']>>[0];
type ToolInput = Parameters<NonNullable<Hooks['tool.execute.before']>>[0];
type ChatInput = Parameters<NonNullable<Hooks['chat.message']>>[0];
type ChatOutput = Parameters<NonNullable<Hooks['chat.message']>>[1];

interface YoloState {
  stage: 'armed' | 'active';
  baseline: string | null;
  count: number;
  // 活動カウンタ（送信条件の判定用）
  userSeen: number;
  toolsSeen: number;
  sentUser: number;
  sentTools: number;
  sentHead: string | null;
  // 発動直後の初回 idle は無条件送信する（合意直後の沈黙を避ける）
  firstIdlePending: boolean;
  // 自投稿の再取り込み除外用
  expectOwn: boolean;
}

interface Ctx {
  client: PluginInput['client'];
  $: PluginInput['$'];
  root: string;
  states: Map<string, YoloState>;
}

interface TextPart {
  type?: unknown;
  text?: unknown;
}

// メッセージ parts から text を集める。形式差（欠損・非配列）に耐える
const collectText = (parts: unknown): string => {
  if (!Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const item of parts) {
    const part: unknown = item;
    if (typeof part !== 'object' || part === null) continue;
    const candidate = part as TextPart;
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') continue;
    texts.push(candidate.text);
  }
  return texts.join('\n');
};

// HEAD を読む。非git・コミット前は null（終了判定は上限カウンタに委ねる）
const readHead = async ($: Ctx['$'], root: string): Promise<string | null> => {
  try {
    const result = await $`git rev-parse HEAD`.cwd(root).nothrow().quiet();
    if (result.exitCode !== 0) return null;
    const head = result.stdout.toString().trim();
    return head === '' ? null : head;
  } catch {
    return null;
  }
};

const arm = async (ctx: Ctx, sessionID: string): Promise<void> => {
  ctx.states.set(sessionID, {
    stage: 'armed',
    baseline: await readHead(ctx.$, ctx.root),
    count: 0,
    userSeen: 0,
    toolsSeen: 0,
    sentUser: 0,
    sentTools: 0,
    sentHead: null,
    firstIdlePending: false,
    expectOwn: false,
  });
};

// 保険の聞き耳: コマンド経路で発火すれば同じく武装する（chat.message と冪等）
const handleCommand = async (ctx: Ctx, input: CommandInput): Promise<void> => {
  if (input.command !== 'workflow') return;
  if (!input.arguments.toLowerCase().split(/\s+/).includes('yolo')) return;
  await arm(ctx, input.sessionID);
};

// 武装・発動の判定。自投稿の再取り込みは消費して活動に数えない（自己循環防止）
const handleChat = async (ctx: Ctx, input: ChatInput, output: ChatOutput): Promise<void> => {
  const text = collectText(output.parts);
  if (text === '') return;
  const current = ctx.states.get(input.sessionID);
  if (current?.expectOwn && (text === CONTINUE_TEXT || text === CAP_TEXT)) {
    current.expectOwn = false;
    return;
  }
  if (!current && isYoloExpansion(text)) {
    await arm(ctx, input.sessionID);
    return;
  }
  if (current && text !== CONTINUE_TEXT && text !== CAP_TEXT) {
    current.userSeen += 1;
    if (current.stage === 'armed' && isAgreement(text)) {
      current.stage = 'active';
      current.firstIdlePending = true;
    }
  }
};

const sendTo = async (
  ctx: Ctx,
  sessionID: string,
  state: YoloState,
  text: string,
): Promise<void> => {
  state.expectOwn = true;
  await ctx.client.session.prompt({
    path: { id: sessionID },
    body: { parts: [{ type: 'text', text }] },
  });
};

// idle 時の継続判定。終了（無言解除）・上限・無為スキップ・送信の順に評価する
const handleIdle = async (ctx: Ctx, sessionID: string): Promise<void> => {
  const current = ctx.states.get(sessionID);
  if (!current || current.stage !== 'active') return;
  const head = await readHead(ctx.$, ctx.root);
  if (current.baseline !== null && head !== null && head !== current.baseline) {
    ctx.states.delete(sessionID);
    return;
  }
  if (current.count >= MAX_CONTINUES) {
    ctx.states.delete(sessionID);
    await sendTo(ctx, sessionID, current, CAP_TEXT);
    return;
  }
  if (!current.firstIdlePending) {
    const progressed =
      current.userSeen !== current.sentUser ||
      current.toolsSeen !== current.sentTools ||
      head !== current.sentHead;
    if (!progressed) {
      return;
    }
  }
  current.firstIdlePending = false;
  current.sentUser = current.userSeen;
  current.sentTools = current.toolsSeen;
  current.sentHead = head;
  current.count += 1;
  await sendTo(ctx, sessionID, current, CONTINUE_TEXT);
};

export const YoloContinuePlugin: Plugin = async ({ client, $, worktree, directory }) => {
  const ctx: Ctx = {
    client,
    $,
    root: resolveProjectRoot({ worktree, directory }),
    states: new Map(),
  };
  return {
    'command.execute.before': async (input) => handleCommand(ctx, input),
    'tool.execute.before': async (input: ToolInput) => {
      const current = ctx.states.get(input.sessionID);
      if (current) current.toolsSeen += 1;
    },
    'chat.message': async (input, output) => handleChat(ctx, input, output),
    event: async ({ event }) => {
      if (event.type !== 'session.idle') return;
      await handleIdle(ctx, event.properties.sessionID);
    },
  };
};
