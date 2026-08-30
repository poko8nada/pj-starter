// ツールトレイルのフック配線。tool.execute.before で思考ギャップを測り、対象ツールの試行を log.try.<id> として直接追記する。
// after で lastActivity を更新し、ターン境界（busy でリセット / idle・error で削除）で整える。
// どの失敗も痕跡1行の欠落に留め、ツール実行の流れ自体は止めない
import fs from 'node:fs';
import path from 'node:path';
import { buildTrailEvent } from './trail';

// セッション単位の状態はモジュールレベルで共有する。
// before / after / event は別々のプラグインから呼ばれるため、インスタンスを跨いで同じ Map を見る。
// エントリはセッション終了（idle / error）で削除され、無制限には増えない。
// テストからリセットするために export する（sync.hook.ts の syncFailureStates と同じ流儀）
export const lastActivity = new Map<string, number>();
export const subSessions = new Set<string>();

export interface TrailBeforeInput {
  tool: string;
  sessionID: string;
  args: Record<string, unknown>;
}

export interface TrailAfterInput {
  sessionID: string;
}

export interface TrailEventInput {
  type: string;
  properties: {
    sessionID?: string;
    info?: { id?: string; parentID?: string };
    status?: { type?: string };
    [key: string]: unknown;
  };
}

export interface TrailHook {
  before(input: TrailBeforeInput): void;
  after(input: TrailAfterInput): void;
  event(input: TrailEventInput): void;
}

export const createTrail = (root: string): TrailHook => {
  // 書き込み先は root ベースで解決する（worktree が "/" に化ける環境差の吸収）
  const logPath = path.join(root, 'events', 'log.jsonl');

  const write = (input: TrailBeforeInput, gap: number): void => {
    try {
      const event = buildTrailEvent({ tool: input.tool, args: input.args, gap, root });
      if (event === null) return;
      fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
    } catch {
      // 書き込み失敗はベストエフォート。次の試行でまた試される
    }
  };

  return {
    before(input) {
      if (subSessions.has(input.sessionID)) return;
      const previous = lastActivity.get(input.sessionID);
      const gap = previous === undefined ? 0 : Math.max(0, Date.now() - previous);
      write(input, gap);
    },
    after(input) {
      if (subSessions.has(input.sessionID)) return;
      lastActivity.set(input.sessionID, Date.now());
    },
    event(input) {
      if (input.type === 'session.created') {
        const info = input.properties.info;
        if (info?.parentID && info?.id) subSessions.add(info.id);
        return;
      }
      if (input.type === 'session.status') {
        const status = input.properties.status;
        if (
          status?.type === 'busy' &&
          input.properties.sessionID &&
          !subSessions.has(input.properties.sessionID)
        )
          lastActivity.set(input.properties.sessionID, Date.now());
        return;
      }
      if (
        (input.type === 'session.idle' || input.type === 'session.error') &&
        input.properties.sessionID
      ) {
        lastActivity.delete(input.properties.sessionID);
        subSessions.delete(input.properties.sessionID);
      }
    },
  };
};
