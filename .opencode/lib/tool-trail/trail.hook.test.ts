// createTrail のフック配線のテスト。ギャップ計測・ターン境界リセット・
// サブエージェント除外・ベストエフォートを、スクラッチの events ディレクトリへ
// 実際に書き込んで検証する
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrail, lastActivity, subSessions } from './trail.hook';

// スクラッチの events ディレクトリを作る（書き込み先の実在を保証する）
const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'trail-test-'));
  mkdirSync(join(root, 'events'));
  return root;
};

const readLog = (root: string): string[] => {
  const logPath = join(root, 'events', 'log.jsonl');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
};

const valueOf = (root: string, index: number): unknown => JSON.parse(readLog(root)[index]).value;

describe('createTrail', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    lastActivity.clear();
    subSessions.clear();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('records the first try of a session with gap 0', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's1', args: { filePath: join(root, 'a.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, path: 'a.ts' });
  });

  it('measures the thinking gap from the previous tool completion', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'bash', sessionID: 's2', args: { command: 'x' } });
    now.mockReturnValue(5000);
    trail.after({ sessionID: 's2' });
    now.mockReturnValue(20000);
    trail.before({ tool: 'read', sessionID: 's2', args: { filePath: join(root, 'a.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 15000, path: 'a.ts' });
  });

  it('resets the baseline at session.status busy so user time is excluded', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's3', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(2000);
    trail.after({ sessionID: 's3' });
    // ユーザーターン（busy でリセット）。1分経過しても次のギャップは小さく保たれる
    now.mockReturnValue(60000);
    trail.event({
      type: 'session.status',
      properties: { sessionID: 's3', status: { type: 'busy' } },
    });
    now.mockReturnValue(61000);
    trail.before({ tool: 'read', sessionID: 's3', args: { filePath: join(root, 'b.ts') } });
    expect(valueOf(root, 1)).toEqual({ tool: 'read', gap: 1000, path: 'b.ts' });
  });

  it('does not reset the baseline for subagent sessions at busy', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    trail.event({
      type: 'session.created',
      properties: { info: { id: 'sub1', parentID: 'main' } },
    });
    trail.event({
      type: 'session.status',
      properties: { sessionID: 'sub1', status: { type: 'busy' } },
    });
    expect(lastActivity.has('sub1')).toBe(false);
  });

  it('deletes the baseline at session.idle so the next turn starts from 0', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's4', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(2000);
    trail.after({ sessionID: 's4' });
    trail.event({ type: 'session.idle', properties: { sessionID: 's4' } });
    now.mockReturnValue(60000);
    trail.before({ tool: 'read', sessionID: 's4', args: { filePath: join(root, 'b.ts') } });
    expect(valueOf(root, 1)).toEqual({ tool: 'read', gap: 0, path: 'b.ts' });
  });

  it('deletes the baseline at session.error like session.idle', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's5', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(2000);
    trail.after({ sessionID: 's5' });
    trail.event({ type: 'session.error', properties: { sessionID: 's5' } });
    now.mockReturnValue(60000);
    trail.before({ tool: 'read', sessionID: 's5', args: { filePath: join(root, 'b.ts') } });
    expect(valueOf(root, 1)).toEqual({ tool: 'read', gap: 0, path: 'b.ts' });
  });

  it('excludes subagent sessions from recording and baseline updates', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    trail.event({
      type: 'session.created',
      properties: { info: { id: 'sub2', parentID: 'main' } },
    });
    trail.before({ tool: 'read', sessionID: 'sub2', args: { filePath: join(root, 'a.ts') } });
    trail.after({ sessionID: 'sub2' });
    expect(readLog(root)).toHaveLength(0);
  });

  it('swallows write failures without breaking the tool flow', () => {
    const root = mkdtempSync(join(tmpdir(), 'trail-test-'));
    roots.push(root);
    const trail = createTrail(root);
    expect(() => {
      trail.before({ tool: 'read', sessionID: 's6', args: { filePath: join(root, 'a.ts') } });
    }).not.toThrow();
  });
});
