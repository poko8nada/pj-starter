#!/usr/bin/env node
// refine.mjs — 上位モデルによる img2img 仕上げ。
// 下書き画像（generate.mjs の出力）を参照画像として渡し、指定スタイルの仕上げモデルで再生成する。
// 使用法:
//   node refine.mjs --input IMAGE [--style photo|illustration] --prompt "..." [--model M] [--n N] [--resolution R] [--aspect-ratio AR] [--output-format F] [--out DIR]
// 仕上げモデルは --style で出し分け: photo -> Nano Banana 2 Lite, illustration -> Seedream 5.0 Lite
// 成果物は imagegen/ に保存する。

import process from 'node:process';
import { buildRefineBody, finishModelForStyle } from './lib/params.mjs';
import { generateImages, resolveInputReference, saveImages, resolveOutDir } from './lib/api.mjs';
import { parsePositiveInt, slug } from './lib/cli.mjs';

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
      'Usage: node refine.mjs --input IMAGE [--style photo|illustration] --prompt "..." [--model M] [--n N] [--resolution R] [--aspect-ratio AR] [--output-format F] [--out DIR]',
    );
    process.exit(1);
  }

  try {
    // モデル未指定なら style から決定する
    if (!args.model) {
      if (!args.style) throw new Error('either --model or --style is required');
      args.model = finishModelForStyle(args.style);
    }
    const body = buildRefineBody({ ...args, inputImage: resolveInputReference(args.input) });
    const result = await generateImages(body);
    const outDir = args.out || resolveOutDir({ final: true, cwd: process.cwd() });
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
