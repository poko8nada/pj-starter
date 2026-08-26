// compressTurn の圧縮規則に関するテスト。集約・重複排除・対象外ツールの無視を検証する
import { describe, expect, it } from 'vitest';
import {
  compressTurn,
  currentTurnMessages,
  isNotable,
  REASONING_THRESHOLD,
  type SummaryMessage,
} from './summary';

const assistant = (reasoning: number, parts: SummaryMessage['parts'] = []): SummaryMessage => ({
  info: { role: 'assistant', tokens: { reasoning } },
  parts,
});

const user = (): SummaryMessage => ({ info: { role: 'user' }, parts: [] });

const turn = (role: 'user' | 'assistant'): SummaryMessage => ({ info: { role }, parts: [] });

const toolPart = (
  tool: string,
  input: Record<string, unknown> = {},
): SummaryMessage['parts'][number] => ({ type: 'tool', tool, state: { input } });

describe('compressTurn', () => {
  it('returns an empty summary for an empty turn', () => {
    expect(compressTurn([])).toEqual({ events: [], reasoning: 0 });
  });

  it('groups file tools by kind and keeps first-appearance order', () => {
    const summary = compressTurn([
      assistant(100, [
        toolPart('read', { filePath: 'a.ts' }),
        toolPart('edit', { filePath: 'b.ts' }),
        toolPart('read', { filePath: 'c.ts' }),
      ]),
      user(),
      assistant(50, [toolPart('skill', { name: 'agenda' })]),
    ]);
    expect(summary).toEqual({
      events: [
        { kind: 'read', paths: ['a.ts', 'c.ts'] },
        { kind: 'edit', paths: ['b.ts'] },
        { kind: 'skill', name: 'agenda' },
      ],
      reasoning: 150,
    });
  });

  it('deduplicates paths within a kind', () => {
    const summary = compressTurn([
      assistant(0, [
        toolPart('read', { filePath: 'a.ts' }),
        toolPart('read', { filePath: 'a.ts' }),
        toolPart('read', { filePath: 'a.ts' }),
      ]),
    ]);
    expect(summary.events).toEqual([{ kind: 'read', paths: ['a.ts'] }]);
  });

  it('lists distinct skills once each in trigger order', () => {
    const summary = compressTurn([
      assistant(0, [
        toolPart('skill', { name: 'agenda' }),
        toolPart('skill', { name: 'commit' }),
        toolPart('skill', { name: 'agenda' }),
      ]),
    ]);
    expect(summary.events).toEqual([
      { kind: 'skill', name: 'agenda' },
      { kind: 'skill', name: 'commit' },
    ]);
  });

  it('collects write tools like read and edit', () => {
    const summary = compressTurn([assistant(0, [toolPart('write', { filePath: 'n.ts' })])]);
    expect(summary.events).toEqual([{ kind: 'write', paths: ['n.ts'] }]);
  });

  it('matches tool names case-insensitively and the file arg variant', () => {
    const summary = compressTurn([
      assistant(0, [toolPart('Read', { filePath: 'a.ts' }), toolPart('edit', { file: 'b.ts' })]),
    ]);
    expect(summary.events).toEqual([
      { kind: 'read', paths: ['a.ts'] },
      { kind: 'edit', paths: ['b.ts'] },
    ]);
  });

  it('ignores tools outside the collection whitelist', () => {
    const summary = compressTurn([
      assistant(0, [
        toolPart('bash', { command: 'pnpm test:run' }),
        toolPart('task', { subagent_type: 'auditor' }),
        toolPart('grep', { pattern: 'x' }),
      ]),
    ]);
    expect(summary.events).toEqual([]);
  });

  it('skips malformed tool parts instead of failing', () => {
    const summary = compressTurn([
      assistant(0, [
        toolPart('edit'),
        toolPart('edit', { filePath: '' }),
        { type: 'tool', tool: 'skill', state: { input: {} } },
        { type: 'text' },
        toolPart('read', { path: 'recovered.ts' }),
      ]),
    ]);
    expect(summary.events).toEqual([{ kind: 'read', paths: ['recovered.ts'] }]);
  });

  it('counts only assistant reasoning and tolerates missing or invalid tokens', () => {
    const summary = compressTurn([
      user(),
      assistant(120),
      { info: { role: 'assistant' }, parts: [] },
      { info: { role: 'assistant', tokens: { reasoning: -5 } }, parts: [] },
    ]);
    expect(summary.reasoning).toBe(120);
  });

  it('records only paths under root, relative to it, and drops the rest', () => {
    const summary = compressTurn(
      [
        assistant(0, [
          toolPart('read', { filePath: '/home/x/pj/src/a.ts' }),
          toolPart('edit', { filePath: '/home/x/other/b.ts' }),
        ]),
      ],
      '/home/x/pj',
    );
    expect(summary.events).toEqual([{ kind: 'read', paths: ['src/a.ts'] }]);
  });
});

describe('isNotable', () => {
  it('keeps turns with any collected event regardless of reasoning', () => {
    const summary = compressTurn([assistant(0, [toolPart('edit', { filePath: 'a.ts' })])]);
    expect(isNotable(summary)).toBe(true);
  });

  it('drops empty turns below the reasoning threshold', () => {
    expect(isNotable({ events: [], reasoning: REASONING_THRESHOLD - 1 })).toBe(false);
  });

  it('keeps thinking-only turns at or above the threshold', () => {
    expect(isNotable({ events: [], reasoning: REASONING_THRESHOLD })).toBe(true);
  });
});

describe('currentTurnMessages', () => {
  it('slices from the last user message so past turns do not leak in', () => {
    const messages = [turn('user'), turn('assistant'), turn('user'), turn('assistant')];
    expect(currentTurnMessages(messages)).toEqual([messages[2], messages[3]]);
  });

  it('returns everything when there is no user message', () => {
    const messages = [turn('assistant')];
    expect(currentTurnMessages(messages)).toEqual(messages);
  });

  it('returns an empty array for an empty history', () => {
    expect(currentTurnMessages([])).toEqual([]);
  });
});
