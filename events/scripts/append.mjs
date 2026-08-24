#!/usr/bin/env node
// イベントを1件追記する。スキルやエージェントが呼ぶのはこのスクリプトのみ。
// 順序はファイル並び順そのものであり、付番処理は存在しない
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { EVENT_TYPES, fail, jstNow, LOG_PATH, parseArgs, parseValue, validateKey } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const type = args.type;
if (!EVENT_TYPES.has(type)) fail(`--type must be one of ${[...EVENT_TYPES].join('/')}`);
validateKey(args.key);
if (type === 'set' && args.value === undefined) fail('--value is required for set');

// note はリデューサには無視される、未来の読み手のための一言注記
const event = { ts: jstNow(), type, key: args.key };
if (type === 'set') event.value = parseValue(args.value);
if (args.note !== undefined) event.note = args.note;

appendFileSync(LOG_PATH, `${JSON.stringify(event)}\n`);
console.log(JSON.stringify(event));
