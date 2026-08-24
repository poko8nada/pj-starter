// clipLines のテスト
import { describe, expect, it } from 'vitest';
import { clipLines } from './text';

describe('clipLines', () => {
  it('keeps text within the limit', () => {
    expect(clipLines('a\nb\nc', 5)).toBe('a\nb\nc');
  });

  it('strips blank and whitespace lines', () => {
    expect(clipLines('a\n\n  \nb', 5)).toBe('a\nb');
  });

  it('clips and annotates overflow', () => {
    const result = clipLines('1\n2\n3\n4\n5', 2);
    expect(result).toBe('1\n2\n...3 more lines');
  });
});
