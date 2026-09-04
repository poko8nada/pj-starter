// api.mjs の境界テスト（I/O層: fetch / fs をモックして失敗モードを検証）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateImages,
  requireApiKey,
  resolveInputReference,
  resolveOutDir,
  saveImages,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('requireApiKey', () => {
  it('returns the key when set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    expect(requireApiKey()).toBe('sk-test');
  });

  it('throws a clear error when not set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(() => requireApiKey()).toThrow(/OPENROUTER_API_KEY is not set/);
  });
});

describe('generateImages', () => {
  it('throws when the API returns no images (silent-success guard)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [], usage: { cost: 0 } }),
      }),
    );
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    await expect(generateImages({ model: 'meta/muse-image', prompt: 'cat' })).rejects.toThrow(
      /returned no images/,
    );
  });

  it('normalizes url and b64_json results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [{ url: 'https://x/a.png' }, { b64_json: Buffer.from('abc').toString('base64') }],
            usage: { cost: 0.01 },
          }),
      }),
    );
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const res = await generateImages({ model: 'meta/muse-image', prompt: 'cat' });
    expect(res.images).toHaveLength(2);
    expect(res.images[0].url).toBe('https://x/a.png');
    expect(res.images[1].b64).toBe(Buffer.from('abc').toString('base64'));
    expect(res.cost).toBe(0.01);
  });

  it('throws a clear error on non-OK status with API error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'bad param' } }),
      }),
    );
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    await expect(generateImages({ model: 'meta/muse-image', prompt: 'cat' })).rejects.toThrow(
      /400: bad param/,
    );
  });

  it('throws a clear error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    await expect(generateImages({ model: 'meta/muse-image', prompt: 'cat' })).rejects.toThrow(
      /network error/,
    );
  });

  it('throws on invalid JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'not-json',
      }),
    );
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    await expect(generateImages({ model: 'meta/muse-image', prompt: 'cat' })).rejects.toThrow(
      /invalid JSON/,
    );
  });
});

describe('resolveInputReference', () => {
  it('passes http(s) URLs through unchanged', () => {
    expect(resolveInputReference('https://x.com/a.png')).toBe('https://x.com/a.png');
  });

  it('passes data URLs through unchanged', () => {
    expect(resolveInputReference('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('converts a local PNG file into a base64 data URL', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
    const file = path.join(dir, 'a.png');
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    const out = resolveInputReference(file);
    expect(out.startsWith('data:image/png;base64,')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('converts local jpeg and webp files with correct MIME', () => {
    /** @type {Array<[string, number[], string]>} */
    const cases = [
      ['jpg', [0xff, 0xd8, 0xff], 'image/jpeg'],
      // WEBP は RIFF コンテナ + "WEBP" チャンク（オフセット8）
      [
        'webp',
        [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
        'image/webp',
      ],
    ]; // [ext, bytes, mime]
    for (const [ext, bytes, mime] of cases) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
      const file = path.join(dir, `a.${ext}`);
      fs.writeFileSync(file, Buffer.from(bytes));
      const out = resolveInputReference(file);
      expect(out.startsWith(`data:${mime};base64,`)).toBe(true);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error for a missing local file', () => {
    expect(() => resolveInputReference('/nonexistent/image.png')).toThrow(
      /failed to read input image/,
    );
  });
});

describe('saveImages', () => {
  it('writes b64 images to disk with generated filenames', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
    const saved = await saveImages(
      { images: [{ url: null, b64: Buffer.from('hello').toString('base64') }] },
      dir,
      'cat',
    );
    expect(saved).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, 'cat.png'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads and writes url images, honoring an explicit extension', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
      }),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
    const saved = await saveImages({ images: [{ url: 'https://x/a', b64: null }] }, dir, 'cat.jpg');
    expect(fs.existsSync(path.join(dir, 'cat.jpg'))).toBe(true);
    expect(saved[0].endsWith('.jpg')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('numbers multiple images without duplicating an explicit extension', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
      }),
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
    await saveImages(
      {
        images: [
          { url: 'https://x/a', b64: null },
          { url: 'https://x/b', b64: null },
        ],
      },
      dir,
      'cat.jpg',
    );
    expect(fs.existsSync(path.join(dir, 'cat-1.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cat-2.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'cat.jpg.jpg'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('infers png/jpeg/webp extensions from magic bytes', async () => {
    /** @type {Array<[string, number[]]>} */
    const cases = [
      ['png', [0x89, 0x50, 0x4e, 0x47]],
      ['jpg', [0xff, 0xd8, 0xff]],
      // WEBP は RIFF コンテナ + "WEBP" チャンク（オフセット8）
      ['webp', [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
      ['png', [0x00, 0x00, 0x00]], // 不明 → png フォールバック
      // RIFF コンテナだが WEBP でない（WAVE 音声）→ png フォールバック
      ['png', [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]],
    ];
    const runs = cases.map(async ([ext, bytes]) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
      const saved = await saveImages(
        { images: [{ url: null, b64: Buffer.from(bytes).toString('base64') }] },
        dir,
        'img',
      );
      expect(saved[0].endsWith(`.${ext}`)).toBe(true);
      fs.rmSync(dir, { recursive: true, force: true });
    });
    await Promise.all(runs);
  });

  it('throws when a url download fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-'));
    await expect(
      saveImages({ images: [{ url: 'https://x/a.png', b64: null }] }, dir, 'cat'),
    ).rejects.toThrow(/failed to download/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('resolveOutDir', () => {
  it('resolves final to imagegen/ and draft to imagegen/tmp/', () => {
    expect(resolveOutDir({ final: true, cwd: '/proj' })).toBe('/proj/imagegen');
    expect(resolveOutDir({ final: false, cwd: '/proj' })).toBe('/proj/imagegen/tmp');
  });
});
