#!/usr/bin/env node
// params.mjs — モデル別パラメータ出し分けの純関数群。
// 画像生成モデルごとに能力（解像度・枚数・対応パラメータ）が異なるため、
// ここで一元的に管理し、リクエストボディを構築する。I/O を持たない純粋ロジック。
// generate.mjs / edit.mjs の両方から利用される（重複の防止）。

// モデル能力テーブル。各モデルの対応パラメータを明示する。
// 出典: OpenRouter /images API のモデル仕様（recon調査 2026-09-02）
export const MODELS = {
  'meta/muse-image': {
    label: 'muse-image',
    kind: 'draft', // 下書き生成（単発で完結可）
    resolution: null, // 解像度Tier非対応（OpenRouter側で supported_parameters が空）
    n: { min: 1, max: 10 },
    size: null,
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
  },
  'google/gemini-3.1-flash-lite-image': {
    label: 'Nano Banana 2 Lite',
    kind: 'finish-photo', // フォト仕上げ
    resolution: ['1K'], // 1K 固定のみ
    n: { min: 1, max: 1 }, // n>1 は拒否
    size: null,
    outputFormats: ['png'], // デフォルト png（base64 返却）
    defaultOutputFormat: 'png',
  },
  'bytedance-seed/seedream-5.0-lite': {
    label: 'Seedream 5.0 Lite',
    kind: 'finish-illustration', // イラスト/文字入り仕上げ
    resolution: ['2K', '4K'],
    n: { min: 1, max: 4 },
    size: '2K',
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'png',
  },
};

// quality パラメータの許容値（モデルが対応しない場合は無視されるが、不正値は弾く）
export const QUALITY_VALUES = ['auto', 'low', 'medium', 'high'];

// モデルIDの妥当性検証。未知モデルは呼び出し時点で弾く（400 での課金事故を防ぐ）
export function assertModel(model) {
  if (!MODELS[model]) {
    throw new Error(`unknown model: ${model} (supported: ${Object.keys(MODELS).join(', ')})`);
  }
  return MODELS[model];
}

// n をモデル対応範囲にクランプする
export function clampN(model, n) {
  const spec = assertModel(model);
  if (n === undefined) return spec.n.min;
  if (!Number.isInteger(n) || n < spec.n.min || n > spec.n.max) {
    throw new Error(`model ${model} supports n in [${spec.n.min}, ${spec.n.max}], got ${n}`);
  }
  return n;
}

// resolution をモデル対応範囲に制約する。非対応値はエラー（未対応パラメータは 400 で弾かれるため）
export function assertResolution(model, resolution) {
  const spec = assertModel(model);
  if (!resolution) return spec.resolution ? spec.resolution[0] : undefined;
  if (!spec.resolution || !spec.resolution.includes(resolution)) {
    const allowed = spec.resolution ? spec.resolution.join('|') : 'none';
    throw new Error(
      `model ${model} does not support resolution "${resolution}" (allowed: ${allowed})`,
    );
  }
  return resolution;
}

// aspect_ratio の形式検証。OpenRouter は "W:H" 形式の文字列を期待する。
// 不正値は呼び出し前に弾いて 400 を防ぐ。
export function assertAspectRatio(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(value)) {
    throw new Error(`invalid aspect_ratio "${value}" (expected e.g. "1:1", "16:9")`);
  }
  return value;
}

// output_format をモデル対応範囲に制約する
export function assertOutputFormat(model, format) {
  const spec = assertModel(model);
  if (!format) return spec.defaultOutputFormat;
  if (!spec.outputFormats.includes(format)) {
    throw new Error(
      `model ${model} does not support output_format "${format}" (allowed: ${spec.outputFormats.join('|')})`,
    );
  }
  return format;
}

// 下書き用モデルの取得（単発/複数候補生成）
export const DRAFT_MODEL = 'meta/muse-image';

// スタイルから img2img 編集モデルを選択する（edit.mjs 用）
//   draft        -> muse-image（安価な再生成）
//   photo        -> Nano Banana 2 Lite（フォトリアル、最速・最安）
//   illustration -> Seedream 5.0 Lite（イラスト/図解/画像内テキスト）
export function modelForStyle(style) {
  if (style === 'draft') return DRAFT_MODEL;
  if (style === 'photo') return 'google/gemini-3.1-flash-lite-image';
  if (style === 'illustration') return 'bytedance-seed/seedream-5.0-lite';
  throw new Error(`unknown style: ${style} (use draft, photo, or illustration)`);
}

// テキスト生成（画像生成）リクエストボディを構築する。
// model / prompt は必須、その他はモデル能力に合わせて制約する。
export function buildGenerateBody({
  model,
  prompt,
  n,
  resolution,
  aspectRatio,
  outputFormat,
  quality,
}) {
  const spec = assertModel(model);
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required');
  const body = {
    model,
    prompt,
    n: clampN(model, n),
  };
  const res = assertResolution(model, resolution);
  if (res) body.resolution = res;
  // 空文字は未指定（undefined）と同等に扱う
  if (aspectRatio !== undefined && aspectRatio !== '') {
    body.aspect_ratio = assertAspectRatio(aspectRatio);
  }
  // output_format: 明示指定はモデル対応範囲で検証して尊重する。未指定時は仕上げモデルのみ既定を付与
  // （muse-image は OpenRouter 側で supported_parameters が空のため、既定を黙って送らない）
  if (outputFormat !== undefined && outputFormat !== '') {
    body.output_format = assertOutputFormat(model, outputFormat);
  } else if (spec.kind !== 'draft') {
    body.output_format = assertOutputFormat(model, outputFormat);
  }
  // quality: 指定時のみ検証して付与（対応値は auto/low/medium/high）
  if (quality !== undefined && quality !== '') {
    if (!QUALITY_VALUES.includes(quality)) {
      throw new Error(`invalid quality "${quality}" (allowed: ${QUALITY_VALUES.join('|')})`);
    }
    body.quality = quality;
  }
  return body;
}

// 編集（img2img 仕上げ）リクエストボディを構築する。参照画像を input_references で渡す。
export function buildRefineBody({
  model,
  prompt,
  inputImage,
  n,
  resolution,
  aspectRatio,
  outputFormat,
}) {
  assertModel(model);
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required');
  if (!inputImage) throw new Error('inputImage is required');
  const body = {
    model,
    prompt,
    n: clampN(model, n),
    input_references: [
      {
        type: 'image_url',
        image_url: { url: inputImage },
      },
    ],
  };
  const res = assertResolution(model, resolution);
  if (res) body.resolution = res;
  // 空文字は未指定（undefined）と同等に扱う
  if (aspectRatio !== undefined && aspectRatio !== '') {
    body.aspect_ratio = assertAspectRatio(aspectRatio);
  }
  // output_format: 明示指定は検証して尊重。未指定時は muse（draft）は送らない
  // （OpenRouter 側で supported_parameters が空のため）、それ以外はモデル既定を付与
  if (outputFormat !== undefined && outputFormat !== '') {
    body.output_format = assertOutputFormat(model, outputFormat);
  } else if (model !== DRAFT_MODEL) {
    body.output_format = assertOutputFormat(model, outputFormat);
  }
  return body;
}
