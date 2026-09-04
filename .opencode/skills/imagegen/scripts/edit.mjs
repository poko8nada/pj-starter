#!/usr/bin/env node
// edit.mjs — img2img 編集（再生成 / 仕上げ）。
// 既存画像（generate.mjs の出力など）を参照画像として渡し、指定スタイルのモデルで再生成する。
// 使用法:
//   node edit.mjs --input IMAGE --style <draft|photo|illustration> --prompt "..." [--model M] [--n N] [--resolution R] [--aspect-ratio AR] [--output-format F] [--out DIR]
// モデルは --style で出し分け:
//   draft        -> muse-image（安価な再生成、imagegen/tmp/ に保存）
//   photo        -> Nano Banana 2 Lite（フォト仕上げ、imagegen/ に保存）
//   illustration -> Seedream 5.0 Lite（イラスト/文字入り仕上げ、imagegen/ に保存）

import process from 'node:process';
import { buildRefineBody, modelForStyle } from './lib/params.mjs';
import { generateImages, resolveInputReference, saveImages } from './lib/api.mjs';
import { parsePositiveInt, resolveEditOutDir, slug } from './lib/cli.mjs';

// CLI 引数をパースする
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--input':
        args.input = value;
        i++;
        break;
      case '--style':
        args.style = value;
        i++;
        break;
      case '--model':
        args.model = value;
        i++;
        break;
      case '--prompt':
        args.prompt = value;
        i++;
        break;
      case '--n':
        args.n = parsePositiveInt(flag, value);
        i++;
        break;
      case '--aspect-ratio':
        args.aspectRatio = value;
        i++;
        break;
      case '--resolution':
        args.resolution = value;
        i++;
        break;
      case '--output-format':
        args.outputFormat = value;
        i++;
        break;
      case '--out':
        args.out = value;
        i++;
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  if (!args.input || !args.prompt) {
    console.error(
      'Usage: node edit.mjs --input IMAGE --style <draft|photo|illustration> --prompt "..." [--model M] [--n N] [--resolution R] [--aspect-ratio AR] [--output-format F] [--out DIR]',
    );
    process.exit(1);
  }

  try {
    // モデル未指定なら style から決定する
    if (!args.model) {
      if (!args.style) throw new Error('either --model or --style is required');
      args.model = modelForStyle(args.style);
    }
    const body = buildRefineBody({ ...args, inputImage: resolveInputReference(args.input) });
    const result = await generateImages(body);
    const outDir = resolveEditOutDir({ ...args, cwd: process.cwd() });
    const baseName = slug(args.prompt);
    const saved = await saveImages(result, outDir, baseName);

    for (const file of saved) console.log(`saved: ${file}`);
    if (result.cost !== null && result.cost !== undefined) console.log(`cost: $${result.cost}`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

void main();
