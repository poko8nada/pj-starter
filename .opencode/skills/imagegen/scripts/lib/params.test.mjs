// params.mjs のテスト（純関数のため happy path + error path）
import { describe, expect, it } from 'vitest';
import {
  assertModel,
  assertOutputFormat,
  assertResolution,
  buildGenerateBody,
  buildRefineBody,
  clampN,
  finishModelForStyle,
} from './params';
describe('assertModel', () => {
  it('accepts known models', () => {
    expect(assertModel('meta/muse-image').kind).toBe('draft');
    expect(assertModel('google/gemini-3.1-flash-lite-image').kind).toBe('finish-photo');
    expect(assertModel('bytedance-seed/seedream-5.0-lite').kind).toBe('finish-illustration');
  });

  it('rejects unknown models', () => {
    expect(() => assertModel('nope/unknown')).toThrow(/unknown model/);
  });
});

describe('clampN', () => {
  it('defaults to min when n is undefined', () => {
    expect(clampN('meta/muse-image')).toBe(1);
    expect(clampN('google/gemini-3.1-flash-lite-image')).toBe(1);
  });

  it('accepts n within range', () => {
    expect(clampN('meta/muse-image', 10)).toBe(10);
    expect(clampN('bytedance-seed/seedream-5.0-lite', 4)).toBe(4);
  });

  it('rejects n outside range', () => {
    expect(() => clampN('meta/muse-image', 11)).toThrow(/n in/);
    expect(() => clampN('google/gemini-3.1-flash-lite-image', 2)).toThrow(/n in/);
  });

  it('rejects non-integer and non-positive values', () => {
    expect(() => clampN('meta/muse-image', NaN)).toThrow(/n in/);
    expect(() => clampN('meta/muse-image', 0)).toThrow(/n in/);
    expect(() => clampN('meta/muse-image', -1)).toThrow(/n in/);
    expect(() => clampN('meta/muse-image', 1.5)).toThrow(/n in/);
    expect(() => clampN('meta/muse-image', '5')).toThrow(/n in/);
    expect(() => clampN('meta/muse-image', Infinity)).toThrow(/n in/);
  });
});

describe('assertResolution', () => {
  it('returns undefined for models without resolution support', () => {
    expect(assertResolution('meta/muse-image')).toBeUndefined();
  });

  it('returns default resolution when not specified', () => {
    expect(assertResolution('google/gemini-3.1-flash-lite-image')).toBe('1K');
    expect(assertResolution('bytedance-seed/seedream-5.0-lite')).toBe('2K');
  });

  it('accepts supported resolutions', () => {
    expect(assertResolution('bytedance-seed/seedream-5.0-lite', '4K')).toBe('4K');
  });

  it('rejects unsupported resolutions', () => {
    expect(() => assertResolution('google/gemini-3.1-flash-lite-image', '2K')).toThrow(
      /does not support resolution/,
    );
  });

  it('rejects resolution for models without resolution support', () => {
    expect(() => assertResolution('meta/muse-image', '2K')).toThrow(/allowed: none/);
  });
});

describe('assertOutputFormat', () => {
  it('defaults to model default format', () => {
    expect(assertOutputFormat('google/gemini-3.1-flash-lite-image')).toBe('png');
  });

  it('accepts supported formats', () => {
    expect(assertOutputFormat('bytedance-seed/seedream-5.0-lite', 'jpeg')).toBe('jpeg');
    expect(assertOutputFormat('meta/muse-image', 'jpeg')).toBe('jpeg');
    expect(assertOutputFormat('meta/muse-image', 'webp')).toBe('webp');
  });

  it('rejects unsupported formats', () => {
    expect(() => assertOutputFormat('bytedance-seed/seedream-5.0-lite', 'webp')).toThrow(
      /does not support output_format/,
    );
    expect(() => assertOutputFormat('google/gemini-3.1-flash-lite-image', 'webp')).toThrow(
      /does not support output_format/,
    );
  });
});

describe('finishModelForStyle', () => {
  it('maps photo to Nano Banana 2 Lite', () => {
    expect(finishModelForStyle('photo')).toBe('google/gemini-3.1-flash-lite-image');
  });

  it('maps illustration to Seedream 5.0 Lite', () => {
    expect(finishModelForStyle('illustration')).toBe('bytedance-seed/seedream-5.0-lite');
  });

  it('rejects unknown styles', () => {
    expect(() => finishModelForStyle('3d')).toThrow(/unknown style/);
  });
});

describe('buildGenerateBody', () => {
  it('builds a draft body with clamped n', () => {
    const body = buildGenerateBody({ model: 'meta/muse-image', prompt: 'cat', n: 5 });
    expect(body.model).toBe('meta/muse-image');
    expect(body.prompt).toBe('cat');
    expect(body.n).toBe(5);
    expect(body.resolution).toBeUndefined();
    expect(body.output_format).toBeUndefined();
  });

  it('enforces 1K and n=1 for Nano Banana', () => {
    const body = buildGenerateBody({
      model: 'google/gemini-3.1-flash-lite-image',
      prompt: 'photo',
    });
    expect(body.n).toBe(1);
    expect(body.resolution).toBe('1K');
    expect(body.output_format).toBe('png');
  });

  it('propagates aspect_ratio and respects explicit output_format for draft', () => {
    const body = buildGenerateBody({
      model: 'meta/muse-image',
      prompt: 'cat',
      aspectRatio: '16:9',
      outputFormat: 'webp',
    });
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.output_format).toBe('webp');
  });

  it('validates quality value', () => {
    const ok = buildGenerateBody({ model: 'meta/muse-image', prompt: 'cat', quality: 'high' });
    expect(ok.quality).toBe('high');
    expect(() =>
      buildGenerateBody({ model: 'meta/muse-image', prompt: 'cat', quality: 'bogus' }),
    ).toThrow(/invalid quality/);
  });

  it('rejects invalid aspect_ratio', () => {
    expect(() =>
      buildGenerateBody({ model: 'meta/muse-image', prompt: 'cat', aspectRatio: '16by9' }),
    ).toThrow(/invalid aspect_ratio/);
  });

  it('treats empty-string aspect_ratio as unspecified', () => {
    const body = buildGenerateBody({ model: 'meta/muse-image', prompt: 'cat', aspectRatio: '' });
    expect(body.aspect_ratio).toBeUndefined();
  });

  it('treats empty-string output_format and quality as unspecified', () => {
    const body = buildGenerateBody({
      model: 'meta/muse-image',
      prompt: 'cat',
      outputFormat: '',
      quality: '',
    });
    expect(body.output_format).toBeUndefined();
    expect(body.quality).toBeUndefined();
  });

  it('throws without a prompt', () => {
    expect(() => buildGenerateBody({ model: 'meta/muse-image' })).toThrow(/prompt is required/);
  });

  it('throws for unknown model and invalid n', () => {
    expect(() => buildGenerateBody({ model: 'bad/x', prompt: 'hi' })).toThrow(/unknown model/);
    expect(() => buildGenerateBody({ model: 'meta/muse-image', prompt: 'hi', n: 99 })).toThrow(
      /n in/,
    );
  });
});

describe('buildRefineBody', () => {
  it('builds an img2img body with input_references', () => {
    const body = buildRefineBody({
      model: 'google/gemini-3.1-flash-lite-image',
      prompt: 'make it photoreal',
      inputImage: 'data:image/png;base64,abc',
    });
    expect(body.model).toBe('google/gemini-3.1-flash-lite-image');
    expect(body.input_references[0].image_url.url).toBe('data:image/png;base64,abc');
    expect(body.resolution).toBe('1K');
    expect(body.output_format).toBe('png');
  });

  it('propagates aspect_ratio and output_format in refine body', () => {
    const body = buildRefineBody({
      model: 'bytedance-seed/seedream-5.0-lite',
      prompt: 'illustration',
      inputImage: 'data:image/png;base64,abc',
      aspectRatio: '3:4',
      outputFormat: 'jpeg',
    });
    expect(body.aspect_ratio).toBe('3:4');
    expect(body.output_format).toBe('jpeg');
    expect(body.resolution).toBe('2K');
  });

  it('rejects invalid aspect_ratio in refine body', () => {
    expect(() =>
      buildRefineBody({
        model: 'bytedance-seed/seedream-5.0-lite',
        prompt: 'illustration',
        inputImage: 'data:image/png;base64,abc',
        aspectRatio: 'wide',
      }),
    ).toThrow(/invalid aspect_ratio/);
  });

  it('treats empty-string aspect_ratio and output_format as unspecified in refine body', () => {
    const body = buildRefineBody({
      model: 'bytedance-seed/seedream-5.0-lite',
      prompt: 'illustration',
      inputImage: 'data:image/png;base64,abc',
      aspectRatio: '',
      outputFormat: '',
    });
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.output_format).toBe('png'); // モデル既定
  });

  it('throws without an input image', () => {
    expect(() =>
      buildRefineBody({ model: 'google/gemini-3.1-flash-lite-image', prompt: 'refine' }),
    ).toThrow(/inputImage is required/);
  });

  it('throws for unknown model, invalid n, and unsupported resolution', () => {
    expect(() =>
      buildRefineBody({ model: 'bad/x', prompt: 'hi', inputImage: 'data:image/png;base64,a' }),
    ).toThrow(/unknown model/);
    expect(() =>
      buildRefineBody({
        model: 'google/gemini-3.1-flash-lite-image',
        prompt: 'hi',
        inputImage: 'data:image/png;base64,a',
        n: 3,
      }),
    ).toThrow(/n in/);
    expect(() =>
      buildRefineBody({
        model: 'google/gemini-3.1-flash-lite-image',
        prompt: 'hi',
        inputImage: 'data:image/png;base64,a',
        resolution: '2K',
      }),
    ).toThrow(/does not support resolution/);
  });
});
