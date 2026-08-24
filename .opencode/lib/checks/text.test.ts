// clipLines のテスト
import { describe, expect, it } from 'vitest';
import { clipLines } from './text';

describe('clipLines', () => {
  it('returns the text as-is when within the limit', () => {
    expect(clipLines('a\nb\nc', 5)).toBe('a\nb\nc');
  });

  it('drops empty lines before counting', () => {
    expect(clipLines('a\n\n  \nb', 5)).toBe('a\nb');
  });

  it('truncates with a remainder note when over the limit', () => {
    const result = clipLines('1\n2\n3\n4\n5', 2);
    expect(result).toBe('1\n2\n...他 3 行');
  });
});
