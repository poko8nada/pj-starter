// 編集ツール判定のテスト
import { describe, expect, it } from 'vitest';
import { isEditTool } from './tools';

describe('isEditTool', () => {
  it('returns true for edit and write', () => {
    expect(isEditTool('edit')).toBe(true);
    expect(isEditTool('write')).toBe(true);
  });

  it('returns false for other tools', () => {
    for (const tool of ['read', 'bash', 'glob', 'grep', 'websearch', 'skill', 'task']) {
      expect(isEditTool(tool)).toBe(false);
    }
  });
});
