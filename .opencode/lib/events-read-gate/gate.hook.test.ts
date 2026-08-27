// ゲート判定ロジックのテスト
import { describe, expect, it } from 'vitest';
import { createGate } from './gate.hook';

const ROOT = '/project';

describe('createGate', () => {
  it('blocks tool calls until the README is read', () => {
    const gate = createGate(ROOT);
    const report = gate.evaluate({ sessionID: 's1', tool: 'bash', filePath: 'x' });
    expect(report.errors.length).toBe(1);
  });

  it('opens the gate when the README is read via a relative path', () => {
    const gate = createGate(ROOT);
    const report = gate.evaluate({
      sessionID: 's1',
      tool: 'read',
      filePath: 'events/README.md',
    });
    expect(report.errors).toEqual([]);
    expect(gate.evaluate({ sessionID: 's1', tool: 'bash', filePath: 'x' }).errors).toEqual([]);
  });

  it('opens the gate when the README is read via a dot-relative path', () => {
    const gate = createGate(ROOT);
    const report = gate.evaluate({
      sessionID: 's1',
      tool: 'read',
      filePath: './events/README.md',
    });
    expect(report.errors).toEqual([]);
  });

  it('opens the gate when the README is read via an absolute path', () => {
    const gate = createGate(ROOT);
    const report = gate.evaluate({
      sessionID: 's1',
      tool: 'read',
      filePath: `${ROOT}/events/README.md`,
    });
    expect(report.errors).toEqual([]);
  });

  it('rejects other files', () => {
    const gate = createGate(ROOT);
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'read', filePath: 'events/spec/schema.md' }).errors
        .length,
    ).toBe(1);
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'read', filePath: 'AGENTS.md' }).errors.length,
    ).toBe(1);
  });

  it('rejects non-read tools', () => {
    const gate = createGate(ROOT);
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'bash', filePath: 'events/README.md' }).errors.length,
    ).toBe(1);
  });

  it('rejects non-string file paths', () => {
    const gate = createGate(ROOT);
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'read', filePath: undefined }).errors.length,
    ).toBe(1);
    expect(gate.evaluate({ sessionID: 's1', tool: 'read', filePath: null }).errors.length).toBe(1);
    expect(gate.evaluate({ sessionID: 's1', tool: 'read', filePath: '' }).errors.length).toBe(1);
  });

  it('keeps gates independent per session', () => {
    const gate = createGate(ROOT);
    gate.open('s1');
    expect(gate.evaluate({ sessionID: 's2', tool: 'bash', filePath: 'x' }).errors.length).toBe(1);
  });

  it('opens and closes the gate', () => {
    const gate = createGate(ROOT);
    gate.open('s1');
    expect(gate.evaluate({ sessionID: 's1', tool: 'bash', filePath: 'x' }).errors).toEqual([]);
    gate.close('s1');
    expect(gate.evaluate({ sessionID: 's1', tool: 'bash', filePath: 'x' }).errors.length).toBe(1);
  });
});
