import path from 'node:path';
import { buildTrailEvent, isCommitCommand, mergeTrailEvents, type TrailEvent } from './trail';
import { isLastLineTrail, replaceLastLine, repairLog, appendTrailEvent } from './trail.io';

export interface TrailBeforeInput {
  tool: string;
  sessionID: string;
  args: Record<string, unknown>;
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
  event(input: TrailEventInput): void;
}

export const createTrail = (root: string): TrailHook => {
  const logPath = path.join(root, 'events', 'log.jsonl');
  let lastTrailLine: TrailEvent | null = null;
  const subSessions = new Set<string>();
  let suppressTrail = false;

  return {
    before(input) {
      if (subSessions.has(input.sessionID)) return;
      if (suppressTrail) return;
      if (input.tool === 'bash' && isCommitCommand(input.args.command)) {
        suppressTrail = true;
        return;
      }
      const gap =
        lastTrailLine === null ? 0 : Math.max(0, Date.now() - new Date(lastTrailLine.ts).getTime());
      try {
        const event = buildTrailEvent({ tool: input.tool, args: input.args, gap, root });
        if (event === null) return;
        if (lastTrailLine !== null && isLastLineTrail(logPath)) {
          const merged = mergeTrailEvents(lastTrailLine, event);
          if (merged !== null) {
            replaceLastLine(logPath, merged);
            repairLog(logPath);
            lastTrailLine = merged;
            return;
          }
        }
        appendTrailEvent(logPath, event);
        repairLog(logPath);
        lastTrailLine = event;
      } catch {
        // 書き込み失敗はベストエフォート。次の試行でまた試される
      }
    },
    event(input) {
      if (input.type === 'session.created') {
        const info = input.properties.info;
        if (info?.parentID && info?.id) subSessions.add(info.id);
        return;
      }
      const sessionID = input.properties.sessionID;
      const isBoundary =
        (input.type === 'session.idle' || input.type === 'session.error') &&
        !!sessionID &&
        !subSessions.has(sessionID);
      if (isBoundary && sessionID) {
        lastTrailLine = null;
        suppressTrail = false;
        subSessions.delete(sessionID);
      }
    },
  };
};
