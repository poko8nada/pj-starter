import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_FAILURE_TTL_MS, compactEvents, compactFailureStates } from './compact.hook';
import { COMPACTION_THRESHOLD } from './threshold';
import { createShellMock } from '../utils/shell-mock';

vi.mock('node:fs');

const compactCalled = (handler: ReturnType<typeof vi.fn>): boolean =>
  handler.mock.calls.some((call) => call[0][0] === 'node events/scripts/compact.mjs');

const setupLog = (root: string, content: string | null) => {
  const logPath = `${root}/events/log.jsonl`;
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    if (p === logPath) return content !== null;
    return false;
  });
  vi.mocked(fs.readFileSync).mockImplementation((p) => {
    if (p === logPath) return content ?? '';
    throw new Error(`unexpected read: ${String(p)}`);
  });
};

describe('compactEvents TTL guard', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    compactFailureStates.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    vi.clearAllMocks();
    const mock = createShellMock({}, '/root-a');
    handler = mock.handler;
  });

  afterEach(() => {
    compactFailureStates.clear();
    vi.useRealTimers();
  });

  it('runs compact when the line count crosses the threshold', async () => {
    const mock = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' } },
      '/root-a',
    );
    handler = mock.handler;
    setupLog('/root-a', Array(COMPACTION_THRESHOLD).fill('{"ts":"x"}').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it('does not run compact below the threshold', async () => {
    const mock = createShellMock({}, '/root-a');
    handler = mock.handler;
    setupLog('/root-a', 'line1\nline2\nline3');
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(false);
  });

  it('clears a stale TTL entry when the line count is below the threshold', async () => {
    compactFailureStates.set('/root-a', Date.now() - (COMPACT_FAILURE_TTL_MS + 1));
    const mock = createShellMock({}, '/root-a');
    handler = mock.handler;
    setupLog('/root-a', 'line1');
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(false);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it('runs compact at the threshold boundary', async () => {
    const mockBelow = createShellMock({}, '/root-a');
    setupLog(
      '/root-a',
      Array(COMPACTION_THRESHOLD - 1)
        .fill('x')
        .join('\n'),
    );
    await compactEvents(mockBelow.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(compactCalled(mockBelow.handler)).toBe(false);

    const mockAt = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' } },
      '/root-b',
    );
    setupLog('/root-b', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    await compactEvents(mockAt.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(compactCalled(mockAt.handler)).toBe(true);
  });

  it('skips compact when the same root failed within TTL', async () => {
    compactFailureStates.set('/root-a', Date.now());
    const mock = createShellMock(
      {
        'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' },
      },
      '/root-a',
    );
    setupLog('/root-a', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(mock.handler)).toBe(false);
  });

  it('runs compact again after TTL elapses', async () => {
    compactFailureStates.set('/root-a', Date.now() - (COMPACT_FAILURE_TTL_MS + 1));
    const mock = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' } },
      '/root-a',
    );
    handler = mock.handler;
    setupLog('/root-a', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });

  it("does not let one root's failure block another root", async () => {
    compactFailureStates.set('/root-a', Date.now());
    const mock = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' } },
      '/root-b',
    );
    handler = mock.handler;
    setupLog('/root-b', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
  });

  it('sets TTL on compact failure', async () => {
    const mock = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 1, stdout: '', stderr: 'compact-boom' } },
      '/root-a',
    );
    setupLog('/root-a', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors.some((e) => e.startsWith('[events] compact'))).toBe(true);
    expect(compactFailureStates.get('/root-a')).toBe(Date.now());
  });

  it('clears the TTL entry on a subsequent success', async () => {
    compactFailureStates.set('/root-a', Date.now());
    vi.setSystemTime(new Date(Date.now() + COMPACT_FAILURE_TTL_MS + 1));
    const mock = createShellMock(
      { 'node events/scripts/compact.mjs': { exitCode: 0, stdout: '', stderr: '' } },
      '/root-a',
    );
    handler = mock.handler;
    setupLog('/root-a', Array(COMPACTION_THRESHOLD).fill('x').join('\n'));
    const report = await compactEvents(mock.ctx as unknown as Parameters<typeof compactEvents>[0]); // oxlint-disable-line typescript/no-unsafe-type-assertion
    expect(report.errors).toEqual([]);
    expect(compactCalled(handler)).toBe(true);
    expect(compactFailureStates.has('/root-a')).toBe(false);
  });
});
