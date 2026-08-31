// イベント駆動システムのファイルパスを解決する。パスは遅延解決（呼び出し時に EVENTS_DIR を読む）する。
// sync-to-starter.mjs が EVENTS_DIR を差し替えて同じモジュールを再利用できるようにするためで、
// モジュールキャッシュを破棄する動的 import は不要になった
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const resolveEventsDir = () =>
  process.env.EVENTS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const EVENTS_DIR = () => resolveEventsDir();
export const LOG_PATH = () => path.join(resolveEventsDir(), 'log.jsonl');
export const SNAPSHOTS_DIR = () => path.join(resolveEventsDir(), 'snapshots');
export const CHECKPOINT_PATH = () => path.join(resolveEventsDir(), 'checkpoint.json');
