#!/usr/bin/env node
// api.mjs — OpenRouter 画像生成 API の共通クライアント。
// generate.mjs / edit.mjs が共有する I/O 層: API_KEY 検証、/images 呼び出し、
// レスポンス（usage.cost）取得、画像バイナリ保存、エラー処理（4xx/5xx）。
// I/O 層のため単体テストは fetch / fs をモックした api.test.mjs で失敗モードを検証する。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const IMAGES_URL = 'https://openrouter.ai/api/v1/images';

// 環境変数から API キーを取得する。スキルはキーを調達せず、環境に委ねる。
// （このプロジェクトではルート .envrc が Keychain からロードする）
export function requireApiKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Load it into the environment first ' +
        '(e.g. the project root .envrc loads it from Keychain).',
    );
  }
  return key;
}

// 画像生成 API を呼び出し、生成結果（ファイル/URL 一覧 + コスト）を返す。
// body は params.mjs で構築済みのリクエストボディ。
export async function generateImages(body) {
  const key = requireApiKey();
  let res;
  try {
    res = await fetch(IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`network error calling OpenRouter: ${err.message}`, { cause: err });
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `OpenRouter returned invalid JSON (status ${res.status}): ${text.slice(0, 500)}`,
    );
  }

  if (!res.ok) {
    const detail = data?.error?.message || data?.message || text.slice(0, 300);
    throw new Error(`OpenRouter API error ${res.status}: ${detail}`);
  }

  // 生成結果を正規化: 各画像の URL または base64 を配列で返す
  const images = Array.isArray(data?.data) ? data.data : [];
  const normalized = images
    .map((item) => {
      if (item?.url) return { url: item.url, b64: null };
      if (item?.b64_json) return { url: null, b64: item.b64_json };
      return null;
    })
    .filter(Boolean);

  // 生成に成功したのに画像が返らないのは異常。沈黙成功にせずエラー化する
  if (normalized.length === 0) {
    throw new Error(
      `OpenRouter returned no images for ${body.model} (status ${res.status}). ` +
        'The request may have failed or the response format is unexpected.',
    );
  }

  return {
    images: normalized,
    cost: data?.usage?.cost ?? data?.cost ?? null,
    model: body.model,
  };
}

// 生成結果をディスクへ保存する。下書きは tmp/、最終成果物は output/ に分ける。
// 返り値: 保存したファイルパス一覧。
// baseName は拡張子なしのステム（例 "cat"）を想定する。複数枚は "-1", "-2" を付ける。
export async function saveImages(result, outDir, baseName) {
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = result.images.map(async (item, i) => {
    let buffer;
    if (item.b64) {
      buffer = Buffer.from(item.b64, 'base64');
    } else if (item.url) {
      const r = await fetch(item.url);
      if (!r.ok) throw new Error(`failed to download generated image ${item.url}: ${r.status}`);
      buffer = Buffer.from(await r.arrayBuffer());
    } else {
      return null;
    }
    const ext = guessExtension(buffer, baseName);
    const stem = path.basename(baseName, path.extname(baseName));
    const filename = result.images.length > 1 ? `${stem}-${i + 1}${ext}` : `${stem}${ext}`;
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });
  return (await Promise.all(jobs)).filter(Boolean);
}

// 拡張子を決定する: baseName に拡張子があればそれを使い、なければバイナリ先頭から推測。
function guessExtension(buffer, baseName) {
  const explicit = path.extname(baseName);
  if (explicit) {
    return explicit;
  }
  if (isPng(buffer)) {
    return '.png';
  }
  if (isJpeg(buffer)) {
    return '.jpg';
  }
  if (isWebp(buffer)) {
    return '.webp';
  }
  return '.png';
}

// PNG マジックバイト（\x89PNG）
function isPng(buffer) {
  return (
    buffer.length > 3 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

// JPEG マジックバイト（\xFF\xD8）
function isJpeg(buffer) {
  return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

// WEBP は RIFF コンテナ + "WEBP" チャンク（"RIFF" 4バイト + オフセット8に "WEBP"）。
// 3バイト "RIF" だけで判定すると WAV/AVI 等の他の RIFF 系を誤判定するため、両方を検証する。
function isWebp(buffer) {
  return (
    buffer.length > 11 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  );
}

// 出力先ディレクトリを解決する。cwd は呼び出し元プロジェクトのルート想定。
// 下書き => <cwd>/imagegen/tmp、最終成果物 => <cwd>/imagegen
export function resolveOutDir({ final: isFinal, cwd }) {
  return isFinal ? path.join(cwd, 'imagegen') : path.join(cwd, 'imagegen', 'tmp');
}

// input_references に渡す参照画像を解決する。
// http(s) / data: の URL はそのまま、ローカルファイルパスは base64 data URL に変換する。
// （OpenRouter の input_references.image_url.url は data URL を要求する）
export function resolveInputReference(input) {
  if (/^(https?:|data:)/i.test(input)) return input;
  let buffer;
  try {
    buffer = fs.readFileSync(input);
  } catch (err) {
    throw new Error(`failed to read input image "${input}": ${err.message}`, { cause: err });
  }
  const mime = mimeFromBuffer(buffer) || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// バイナリ先頭から MIME を推定する（guessExtension と対）
function mimeFromBuffer(buffer) {
  if (isPng(buffer)) {
    return 'image/png';
  }
  if (isJpeg(buffer)) {
    return 'image/jpeg';
  }
  if (isWebp(buffer)) {
    return 'image/webp';
  }
  return null;
}
