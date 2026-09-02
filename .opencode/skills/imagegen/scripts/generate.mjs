#!/usr/bin/env node
// generate.mjs — muse-image による下書き生成。
// 単発（デフォルト）または複数候補（--n）を生成し、imagegen/tmp/ に保存する。
// 使用法:
//   node generate.mjs --prompt "..." [--n 5] [--aspect-ratio 1:1] [--quality medium] [--output-format png] [--final] [--out DIR]
// 単発で完結する用途はそのまま使い、必要なら refine.mjs で仕上げる。

import process from 'node:process';
import { buildGenerateBody, DRAFT_MODEL } from './lib/params.mjs';
import { generateImages, saveImages, resolveOutDir } from './lib/api.mjs';
import { parsePositiveInt, slug } from './lib/cli.mjs';

// CLI 引数をパースする
function parseArgs(argv) {
  const args = { model: DRAFT_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
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
      case '--quality':
        args.quality = value;
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
      case '--final':
        args.final = true;
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

  if (!args.prompt) {
    console.error(
      'Usage: node generate.mjs --prompt "..." [--n 5] [--aspect-ratio 1:1] [--quality medium] [--output-format png] [--final] [--out DIR]',
    );
    process.exit(1);
  }

  try {
    const body = buildGenerateBody(args);
    const result = await generateImages(body);
    const outDir = args.out || resolveOutDir({ final: !!args.final, cwd: process.cwd() });
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
