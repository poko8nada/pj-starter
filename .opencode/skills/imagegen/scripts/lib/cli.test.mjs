// cli.mjs のテスト（純粋ヘルパー: parsePositiveInt / slug / resolveEditOutDir）
import { describe, expect, it } from 'vitest';
import { parsePositiveInt, resolveEditOutDir, slug } from './cli';

describe('parsePositiveInt', () => {
  it('parses valid positive integers', () => {
    expect(parsePositiveInt('--n', '5')).toBe(5);
    expect(parsePositiveInt('--n', '1')).toBe(1);
  });

  it('rejects non-integer and non-positive values', () => {
    expect(() => parsePositiveInt('--n', '0')).toThrow(/requires a positive integer/);
    expect(() => parsePositiveInt('--n', '-1')).toThrow(/requires a positive integer/);
    expect(() => parsePositiveInt('--n', '1.5')).toThrow(/requires a positive integer/);
    expect(() => parsePositiveInt('--n', 'abc')).toThrow(/requires a positive integer/);
    expect(() => parsePositiveInt('--n', 'Infinity')).toThrow(/requires a positive integer/);
    expect(() => parsePositiveInt('--n', undefined)).toThrow(/requires a positive integer/);
  });
});

describe('slug', () => {
  it('produces a lowercase hyphenated slug', () => {
    expect(slug('A Cat in the Rain')).toBe('a-cat-in-the-rain');
  });

  it('strips leading/trailing and collapses separators', () => {
    expect(slug('--hello   world--')).toBe('hello-world');
  });

  it('caps length at 40 chars', () => {
    expect(slug('a'.repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it('falls back to "image" for empty input', () => {
    expect(slug('!!!')).toBe('image');
  });
});

describe('resolveEditOutDir', () => {
  it('routes draft (muse) to imagegen/tmp/', () => {
    expect(resolveEditOutDir({ model: 'meta/muse-image', cwd: '/proj' })).toBe(
      '/proj/imagegen/tmp',
    );
  });

  it('routes photo/illustration to imagegen/', () => {
    expect(resolveEditOutDir({ model: 'google/gemini-3.1-flash-lite-image', cwd: '/proj' })).toBe(
      '/proj/imagegen',
    );
    expect(resolveEditOutDir({ model: 'bytedance-seed/seedream-5.0-lite', cwd: '/proj' })).toBe(
      '/proj/imagegen',
    );
  });

  it('honors an explicit --out over the default', () => {
    expect(resolveEditOutDir({ model: 'meta/muse-image', out: '/custom', cwd: '/proj' })).toBe(
      '/custom',
    );
  });
});
