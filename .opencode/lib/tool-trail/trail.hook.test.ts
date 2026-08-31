// createTrail のフック配線のテスト。ギャップ計測・ターン境界リセット・マージ動作を検証する
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrail } from './trail.hook';

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
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts'] });
  });

  it('measures the thinking gap from the previous trail line', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'bash', sessionID: 's2', args: { command: 'ls' } });
    now.mockReturnValue(20000);
    trail.before({ tool: 'read', sessionID: 's2', args: { filePath: join(root, 'a.ts') } });
    expect(readLog(root)).toHaveLength(2);
    expect(valueOf(root, 1)).toEqual({ tool: 'read', gap: 19000, targets: ['a.ts'] });
  });

  it('merges consecutive same-tool tries into one line', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's3', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(2000);
    trail.before({ tool: 'read', sessionID: 's3', args: { filePath: join(root, 'b.ts') } });
    now.mockReturnValue(3000);
    trail.before({ tool: 'read', sessionID: 's3', args: { filePath: join(root, 'c.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({
      tool: 'read',
      gap: 0,
      targets: ['a.ts', 'b.ts', 'c.ts'],
    });
  });

  it('writes a new line when the tool changes', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's4', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(2000);
    trail.before({ tool: 'edit', sessionID: 's4', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(2);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts'] });
    expect(valueOf(root, 1)).toEqual({ tool: 'edit', gap: 1000, targets: ['b.ts'] });
  });

  it('never truncates a state event that precedes a try', () => {
    const root = makeRoot();
    roots.push(root);
    appendFileSync(
      join(root, 'events', 'log.jsonl'),
      `${JSON.stringify({
        ts: '2026-08-30T10:00:00.000+09:00',
        type: 'set',
        key: 'meta.harness.x.status',
        value: { stage: 'commit', text: 'x' },
      })}\n`,
    );
    const trail = createTrail(root);
    trail.before({ tool: 'read', sessionID: 's5', args: { filePath: join(root, 'a.ts') } });
    expect(readLog(root)).toHaveLength(2);
    expect(valueOf(root, 1)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts'] });
  });

  it('does not merge when a state event is written between same-tool tries', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's5b', args: { filePath: join(root, 'a.ts') } });
    appendFileSync(
      join(root, 'events', 'log.jsonl'),
      `${JSON.stringify({
        ts: '2026-08-30T10:00:01.000+09:00',
        type: 'set',
        key: 'meta.harness.x.status',
        value: { stage: 'commit', text: 'x' },
      })}\n`,
    );
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    trail.before({ tool: 'read', sessionID: 's5b', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(3);
    expect(valueOf(root, 2)).toEqual({ tool: 'read', gap: 1000, targets: ['b.ts'] });
  });
});

describe('createTrail repair', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('repairs a corrupted log by dropping broken lines', () => {
    const root = makeRoot();
    roots.push(root);
    appendFileSync(join(root, 'events', 'log.jsonl'), '{"broken":\n');
    const trail = createTrail(root);
    trail.before({ tool: 'read', sessionID: 's5e', args: { filePath: join(root, 'a.ts') } });
    const log = readLog(root);
    expect(log).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts'] });
  });

  it('drops multiple corrupted lines and empty lines in one repair', () => {
    const root = makeRoot();
    roots.push(root);
    appendFileSync(join(root, 'events', 'log.jsonl'), '{"broken":\n\n{"also":\n\n');
    const trail = createTrail(root);
    trail.before({ tool: 'read', sessionID: 's5f', args: { filePath: join(root, 'a.ts') } });
    const log = readLog(root);
    expect(log).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts'] });
  });

  it('merges correctly when the file has no trailing newline', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's5g', args: { filePath: join(root, 'a.ts') } });
    const logPath = join(root, 'events', 'log.jsonl');
    const text = readFileSync(logPath, 'utf8');
    writeFileSync(logPath, text.trimEnd());
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    trail.before({ tool: 'read', sessionID: 's5g', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts', 'b.ts'] });
  });
});

describe('createTrail boundaries', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('does not reset on busy — merges consecutive same-tool within a turn', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's5d', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(60000);
    trail.event({
      type: 'session.status',
      properties: { sessionID: 's5d', status: { type: 'busy' } },
    });
    now.mockReturnValue(61000);
    trail.before({ tool: 'read', sessionID: 's5d', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts', 'b.ts'] });
  });

  it('does not reset on busy — different tools write separate lines', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's6', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(60000);
    trail.event({
      type: 'session.status',
      properties: { sessionID: 's6', status: { type: 'busy' } },
    });
    now.mockReturnValue(61000);
    trail.before({ tool: 'edit', sessionID: 's6', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(2);
    expect(valueOf(root, 1)).toEqual({ tool: 'edit', gap: 60000, targets: ['b.ts'] });
  });

  it('deletes the baseline at session.idle so the next turn starts from 0', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's7', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(60000);
    trail.event({ type: 'session.idle', properties: { sessionID: 's7' } });
    now.mockReturnValue(61000);
    trail.before({ tool: 'edit', sessionID: 's7', args: { filePath: join(root, 'b.ts') } });
    expect(valueOf(root, 1)).toEqual({ tool: 'edit', gap: 0, targets: ['b.ts'] });
  });

  it('deletes the baseline at session.error like session.idle', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 's8', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(60000);
    trail.event({ type: 'session.error', properties: { sessionID: 's8' } });
    now.mockReturnValue(61000);
    trail.before({ tool: 'edit', sessionID: 's8', args: { filePath: join(root, 'b.ts') } });
    expect(valueOf(root, 1)).toEqual({ tool: 'edit', gap: 0, targets: ['b.ts'] });
  });

  it('excludes subagent sessions from recording', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    trail.event({
      type: 'session.created',
      properties: { info: { id: 'sub2', parentID: 'main' } },
    });
    trail.before({ tool: 'read', sessionID: 'sub2', args: { filePath: join(root, 'a.ts') } });
    expect(readLog(root)).toHaveLength(0);
  });

  it('does not reset baseline on subagent idle', () => {
    const root = makeRoot();
    roots.push(root);
    const trail = createTrail(root);
    const now = vi.spyOn(Date, 'now');
    trail.event({
      type: 'session.created',
      properties: { info: { id: 'sub1', parentID: 'main' } },
    });
    now.mockReturnValue(1000);
    trail.before({ tool: 'read', sessionID: 'main', args: { filePath: join(root, 'a.ts') } });
    now.mockReturnValue(5000);
    trail.event({ type: 'session.idle', properties: { sessionID: 'sub1' } });
    now.mockReturnValue(6000);
    trail.before({ tool: 'read', sessionID: 'main', args: { filePath: join(root, 'b.ts') } });
    expect(readLog(root)).toHaveLength(1);
    expect(valueOf(root, 0)).toEqual({ tool: 'read', gap: 0, targets: ['a.ts', 'b.ts'] });
  });

  it('swallows write failures without breaking the tool flow', () => {
    const root = mkdtempSync(join(tmpdir(), 'trail-test-'));
    roots.push(root);
    const trail = createTrail(root);
    expect(() => {
      trail.before({ tool: 'read', sessionID: 's9', args: { filePath: join(root, 'a.ts') } });
    }).not.toThrow();
  });
});
