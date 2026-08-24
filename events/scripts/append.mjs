#!/usr/bin/env node
// イベントを追記する。単一（--type/--key/--value）とバッチ（--file）の両方に対応。
// 順序はファイル並び順そのものであり、付番処理は存在しない
import fs from 'node:fs';
import process from 'node:process';
import { buildEvent, EventError, fail, LOG_PATH, parseArgs, parseValue } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));

try {
  if (args.file !== undefined) {
    // バッチモード: draft JSONL の全行を検証してから一括追記する。
    // 1 行でも不正なら何も書かない
    if (args.type !== undefined || args.key !== undefined || args.value !== undefined)
      throw new EventError('--file cannot be combined with --type/--key/--value');
    const drafts = fs
      .readFileSync(args.file, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new EventError(`invalid JSON at line ${index + 1}`);
        }
      });
    const events = drafts.map((draft) => buildEvent(draft));
    if (events.length === 0) console.log('no events');
    else {
      const lines = events.map((event) => JSON.stringify(event)).join('\n');
      fs.appendFileSync(LOG_PATH, `${lines}\n`);
      console.log(`appended ${events.length} events`);
    }
  } else {
    // 単一モード: value は JSON 文字列として解釈し、不可なら生の文字列とする
    const event = buildEvent({
      type: args.type,
      key: args.key,
      value: args.value === undefined ? undefined : parseValue(args.value),
      note: args.note,
    });
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(event)}\n`);
    console.log(JSON.stringify(event));
  }
} catch (error) {
  if (error instanceof EventError) fail(error.message);
  throw error;
}
