// ターンサマリの圧縮コア。メッセージ履歴を {events, reasoning} へ集約する純粋関数。
// I/O(SDK呼び出しやログ追記)は emit.hook 側に置き、ここでは形だけを扱う

// 収集対象のファイル系ツール。bash / task / grep 等は意図的に収集しない
const FILE_TOOLS: ReadonlySet<string> = new Set(['read', 'edit', 'write']);
const isFileTool = (tool: string): tool is FileEventKind => FILE_TOOLS.has(tool);

export type FileEventKind = 'read' | 'edit' | 'write';

export type SummaryEvent =
  | { kind: FileEventKind; paths: string[] }
  | { kind: 'skill'; name: string };

export interface TurnSummary {
  events: SummaryEvent[];
  reasoning: number;
}

// 空のターンをどこまで残すかの閾値。触ったファイルがないターンは、
// 思考量がこの値を超えるときだけ「深考の局面」として残す
export const REASONING_THRESHOLD = 10_000;

// 運用ターン(append/commit 等 bash のみ)や雑談の空行を落とし、
// ファイル・スキルを触ったターンと深考の局面だけを記録対象にする
export const isNotable = (summary: TurnSummary): boolean =>
  summary.events.length > 0 || summary.reasoning >= REASONING_THRESHOLD;

// SDK の Message/Part を構造的に受けられる最小形。呼び出し側で実型との適合を見る
export interface SummaryMessage {
  info: {
    role: string;
    tokens?: { reasoning?: number };
  };
  parts: Array<{
    type: string;
    tool?: string;
    state?: { input?: Record<string, unknown> };
  }>;
}

// ツール群で引数名が揺れるため、代表的なキーを順に当てて対象パスを取り出す
const pathFromInput = (input: Record<string, unknown>): string | null => {
  for (const key of ['filePath', 'path', 'file']) {
    const value = input[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
};

// 最後のユーザーメッセージ以降を「現在のターン」として切り出す。
// client のメッセージ取得はセッション全履歴を返すため、これがないと複数ターン分が混ざる
export const currentTurnMessages = (messages: SummaryMessage[]): SummaryMessage[] => {
  const index = messages.findLastIndex((message) => message.info.role === 'user');
  return index === -1 ? messages : messages.slice(index);
};

// メッセージ履歴をターンサマリ1件へ圧縮する。
// ファイル系は種別ごとにパス重複排除し、種別の初回出現順で先に列挙。
// skill は名前ごとに初回出現順で後に並べる(全体の時系列再現はしない粗い足跡)。
// root を渡すとワークツリー配下だけを相対パスで記録し、外のパスは環境情報になるため捨てる
export const compressTurn = (messages: SummaryMessage[], root?: string): TurnSummary => {
  const toRecorded = (path: string): string | null => {
    if (!root) return path;
    const prefix = root.endsWith('/') ? root : `${root}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : null;
  };
  const groups = new Map<FileEventKind, { paths: string[]; seen: Set<string> }>();
  const skills: string[] = [];
  const skillSeen = new Set<string>();
  let reasoning = 0;

  for (const message of messages) {
    if (message.info.role === 'assistant') {
      const tokens = message.info.tokens?.reasoning;
      if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0) reasoning += tokens;
    }
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool' || typeof part.tool !== 'string') continue;
      const tool = part.tool.toLowerCase();
      if (isFileTool(tool)) {
        const path = pathFromInput(part.state?.input ?? {});
        if (!path) continue;
        const label = toRecorded(path);
        if (!label) continue;
        const kind: FileEventKind = tool;
        const group = groups.get(kind) ?? { paths: [], seen: new Set<string>() };
        if (!group.seen.has(label)) {
          group.seen.add(label);
          group.paths.push(label);
        }
        groups.set(kind, group);
      } else if (tool === 'skill') {
        const name = part.state?.input?.name;
        if (typeof name === 'string' && name !== '' && !skillSeen.has(name)) {
          skillSeen.add(name);
          skills.push(name);
        }
      }
    }
  }

  const events: SummaryEvent[] = [
    ...[...groups.entries()].map(([kind, group]) => ({ kind, paths: group.paths })),
    ...skills.map((name) => ({ kind: 'skill' as const, name })),
  ];
  return { events, reasoning };
};
