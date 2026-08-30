// 編集ツール判定のテスト
import { describe, expect, it } from 'vitest';
import { isEditTool, isTrailTool } from './tools';

describe('isEditTool', () => {
  it('returns true for edit and write', () => {
    expect(isEditTool('edit')).toBe(true);
    expect(isEditTool('write')).toBe(true);
  });

  it('returns false for other tools', () => {
    for (const tool of ['read', 'bash', 'glob', 'grep', 'websearch', 'skill', 'task'])
      expect(isEditTool(tool)).toBe(false);
  });
});

describe('isTrailTool', () => {
  it('returns true for read, edit, write and skill', () => {
    for (const tool of ['read', 'edit', 'write', 'skill']) expect(isTrailTool(tool)).toBe(true);
  });

  it('returns false for other tools', () => {
    for (const tool of ['bash', 'glob', 'grep', 'websearch', 'task', 'question'])
      expect(isTrailTool(tool)).toBe(false);
  });
});
