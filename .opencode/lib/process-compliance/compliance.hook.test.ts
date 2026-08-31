// プロセス順守チェック判定ロジックのテスト
import { describe, expect, it } from 'vitest';
import { createCompliance } from './compliance.hook';
const STATUS_APPEND = `node events/scripts/append.mjs --set meta.harness.x.status '{"stage":"ready","text":"t"}'`;
const STATUS_APPEND_BUILD = `node events/scripts/append-build.mjs --set meta.harness.x.status '{"stage":"ready","text":"t"}'`;

describe('createCompliance', () => {
  it('blocks edit until a status transition is recorded', () => {
    const compliance = createCompliance();
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('blocks write until a status transition is recorded', () => {
    const compliance = createCompliance();
    expect(compliance.evaluate({ sessionID: 's1', tool: 'write' }).errors.length).toBe(1);
  });

  it('opens when a status append is executed', () => {
    const compliance = createCompliance();
    const report = compliance.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(report.errors).toEqual([]);
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('opens when a status append via the append-build wrapper is executed', () => {
    const compliance = createCompliance();
    const report = compliance.evaluate({
      sessionID: 's1',
      tool: 'bash',
      command: STATUS_APPEND_BUILD,
    });
    expect(report.errors).toEqual([]);
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('does not open on a non-status append', () => {
    const compliance = createCompliance();
    compliance.evaluate({
      sessionID: 's1',
      tool: 'bash',
      command: 'node events/scripts/append.mjs --set product.what.value x',
    });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open on a command with only the .status marker', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: 'echo .status' });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open on a non-string command', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: undefined });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open on non-bash tools even with both markers', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'read', command: 'append.mjs .status' });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('does not open on non-bash tools', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'read' });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('never blocks read-only tools', () => {
    const compliance = createCompliance();
    for (const tool of ['read', 'glob', 'grep', 'websearch', 'bash', 'skill', 'task']) {
      expect(compliance.evaluate({ sessionID: 's1', tool, command: 'x' }).errors).toEqual([]);
    }
  });

  it('keeps checks independent per session', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(compliance.evaluate({ sessionID: 's2', tool: 'edit' }).errors.length).toBe(1);
  });

  it('re-arms with close', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    compliance.close('s1');
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors.length).toBe(1);
  });

  it('re-opens after re-arm with a new status append', () => {
    const compliance = createCompliance();
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    compliance.close('s1');
    compliance.evaluate({ sessionID: 's1', tool: 'bash', command: STATUS_APPEND });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('passes through when disabled', () => {
    const compliance = createCompliance({ enabled: false });
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('allows edits from exempt sessions', () => {
    const compliance = createCompliance();
    compliance.exempt('s1');
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('keeps exempt sessions allowed after close', () => {
    const compliance = createCompliance();
    compliance.exempt('s1');
    compliance.close('s1');
    expect(compliance.evaluate({ sessionID: 's1', tool: 'edit' }).errors).toEqual([]);
  });

  it('keeps other sessions blocked when one session is exempt', () => {
    const compliance = createCompliance();
    compliance.exempt('s1');
    expect(compliance.evaluate({ sessionID: 's2', tool: 'edit' }).errors.length).toBe(1);
  });

  it('lets exempt bypass the inside-root block', () => {
    const compliance = createCompliance({ root: '/project' });
    compliance.exempt('s1');
    expect(
      compliance.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/project/src/file.ts' })
        .errors,
    ).toEqual([]);
  });

  it('allows edits outside the project root even when armed', () => {
    const compliance = createCompliance({ root: '/project' });
    expect(
      compliance.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/outside/file.ts' }).errors,
    ).toEqual([]);
  });

  it('blocks edits inside the project root when armed', () => {
    const compliance = createCompliance({ root: '/project' });
    expect(
      compliance.evaluate({ sessionID: 's1', tool: 'edit', filePath: '/project/src/file.ts' })
        .errors.length,
    ).toBe(1);
  });

  it('blocks edits with a relative path inside the root when armed', () => {
    const compliance = createCompliance({ root: '/project' });
    expect(
      compliance.evaluate({ sessionID: 's1', tool: 'edit', filePath: 'src/file.ts' }).errors.length,
    ).toBe(1);
  });

  it('treats a non-string filePath as inside the root', () => {
    const compliance = createCompliance({ root: '/project' });
    expect(
      compliance.evaluate({ sessionID: 's1', tool: 'edit', filePath: undefined }).errors.length,
    ).toBe(1);
  });
});
