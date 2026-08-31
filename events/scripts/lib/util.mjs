// 汎用小道具。時刻・失敗・引数解析・値の解釈
import process from 'node:process';

export const jstNow = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');

export const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

export const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--')) fail(`unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
};

export const parseValue = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export class EventError extends Error {}
