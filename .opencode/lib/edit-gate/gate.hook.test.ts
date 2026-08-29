// ゲート判定ロジックのテスト
import { describe, expect, it } from 'vitest';
import { createGate } from './gate.hook';

const STATUS_APPEND = `node events/scripts/append.mjs --set meta.harness.x.status '{"stage":"ready","text":"t"}'`;

describe('createGate', () => {
  it('blocks edit until a status transition is recorded', () => {
    const gate = createGate();
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('blocks write until a status transition is recorded', () => {
    const gate = createGate();
    expect(gate.evaluate({ sessionID: 's1', tool: 'write' }).errors.length).toBe(1);
  });

  it('opens the gate when a status append is executed', () => {
    const gate = createGate();
    const report = gate.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(report.errors).toEqual([]);
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('does not open the gate on a non-status append', () => {
    const gate = createGate();
    gate.evaluate({
      sessionID: 's1',
      tool: 'bash',
      command: 'node events/scripts/append.mjs --set product.what.value x',
    });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open the gate on a command with only the .status marker', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: 'echo .status' });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open the gate on a non-string command', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: undefined });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open the gate on non-bash tools even with both markers', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'read', command: 'append.mjs .status' });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open the gate on non-bash tools', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'read' });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('never blocks read-only tools', () => {
    const gate = createGate();
    for (const tool of ['read', 'glob', 'grep', 'websearch', 'bash', 'skill', 'task'])
      expect(gate.evaluate({ sessionID: 's1', tool, command: 'x' }).errors).toEqual([]);
  });

  it('keeps gates independent per session', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(gate.evaluate({ sessionID: 's2', tool: 'edit' }).errors.length).toBe(1);
  });

  it('re-arms the gate with close', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    gate.close('s1');
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('re-opens the gate after re-arm with a new status append', () => {
    const gate = createGate();
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    gate.close('s1');
    gate.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('passes through when disabled', () => {
    const gate = createGate({ enabled: false });
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('allows edits from exempt sessions', () => {
    const gate = createGate();
    gate.exempt('s1');
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('keeps exempt sessions allowed after close', () => {
    const gate = createGate();
    gate.exempt('s1');
    gate.close('s1');
    expect(gate.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('keeps other sessions blocked when one session is exempt', () => {
    const gate = createGate();
    gate.exempt('s1');
    expect(gate.evaluate({ sessionID: 's2', tool: 'edit' }).errors.length).toBe(1);
  });

  it('lets exempt bypass the inside-root block', () => {
    const gate = createGate({ root: '/project' });
    gate.exempt('s1');
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/project/src/file.ts' }).errors,
    ).toEqual([]);
  });

  it('allows edits outside the project root even when armed', () => {
    const gate = createGate({ root: '/project' });
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/outside/file.ts' }).errors,
    ).toEqual([]);
  });

  it('blocks edits inside the project root when armed', () => {
    const gate = createGate({ root: '/project' });
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/project/src/file.ts' }).errors
        .length,
    ).toBe(1);
  });

  it('blocks edits with a relative path inside the root when armed', () => {
    const gate = createGate({ root: '/project' });
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'edit', filePath: 'src/file.ts' }).errors.length,
    ).toBe(1);
  });

  it('treats a non-string filePath as inside the root', () => {
    const gate = createGate({ root: '/project' });
    expect(
      gate.evaluate({ sessionID: 's1', tool: 'edit', filePath: undefined }).errors.length,
    ).toBe(1);
  });
});
