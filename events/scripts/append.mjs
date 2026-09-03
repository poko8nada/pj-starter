// イベントを追記する。1回の呼び出しで複数操作（--set / --del の繰り返し）とバッチ（--file）に対応する。全操作を検証してから一括追記し、1行でも不正なら何も書かない。同一呼び出し内のイベントは同一tsを持つ。
// 追記前に仮畳み込み（checkpoint + 既存ログ + 新イベント）で meta 整合性を検証し、違反があれば何も書かずに失敗する（原子性の確保）。
// 順序はファイル並び順そのものであり、付番処理は存在しない
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import {
  applyFoldable,
  auditMetaIntegrity,
  buildEvent,
  EventError,
  fail,
  jstNow,
  loadBase,
  LOG_PATH,
  parseValue,
  readEvents,
} from './lib.mjs';

// ブランチ名を解決する。EVENTS_BRANCH が設定されていればそれを、無ければ git から読む。
// 空文字は「設定済みだが不正」として上書きせず、buildEvent の検証で拒否させる。
// 非 git 環境では未設定のまま（branch フィールドは付与されない）
const ensureBranch = () => {
  if (process.env.EVENTS_BRANCH !== undefined) return;
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (branch) process.env.EVENTS_BRANCH = branch;
  } catch {
    // 非 git 環境では branch を付与しない
  }
};

// --set key value と --del key の繰り返し、または --file path を解釈する
const parseOps = (argv) => {
  const ops = [];
  for (let i = 0; i < argv.length;) {
    const flag = argv[i];
    if (!flag?.startsWith('--')) fail(`unexpected argument: ${flag}`);
    const name = flag.slice(2);
    if (name === 'set') {
      if (argv[i + 1] === undefined || argv[i + 2] === undefined) {
        fail('--set requires <key> <value>');
      }
      ops.push({ op: 'set', key: argv[i + 1], raw: argv[i + 2] });
      i += 3;
    } else if (name === 'del') {
      if (argv[i + 1] === undefined) fail('--del requires <key>');
      ops.push({ op: 'del', key: argv[i + 1] });
      i += 2;
    } else if (name === 'file') {
      if (argv[i + 1] === undefined) fail('--file requires <path>');
      ops.push({ op: 'file', path: argv[i + 1] });
      i += 2;
    } else fail(`unknown flag: --${name}`);
  }
  return ops;
};

const readDrafts = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new EventError(`invalid JSON at line ${index + 1}`);
      }
    });

const main = () => {
  ensureBranch();
  const ops = parseOps(process.argv.slice(2));
  const fileOp = ops.find((op) => op.op === 'file');
  if (fileOp && ops.length > 1) fail('--file cannot be combined with --set/--del');
  if (ops.length === 0) {
    fail('no operations: use --set <key> <value>, --del <key> or --file <path>');
  }

  // 同一呼び出しは同一時刻。検証を全件通してから追記する
  const ts = jstNow();
  const drafts = fileOp ? readDrafts(fileOp.path) : ops;
  const events = drafts.map((draft) =>
    fileOp
      ? buildEvent(draft, ts)
      : buildEvent(
          draft.op === 'set'
            ? { type: 'set', key: draft.key, value: parseValue(draft.raw) }
            : { type: 'del', key: draft.key },
          ts,
        ),
  );
  if (events.length === 0) {
    console.log('no events');
    return;
  }

  // 仮畳み込み（checkpoint + 既存ログ + 新イベント）で meta 整合性を事前検証する。
  // 違反があれば何も書かずに失敗する（原子性の確保）
  const trees = loadBase().trees;
  applyFoldable(trees, readEvents());
  applyFoldable(trees, events);
  const findings = auditMetaIntegrity(trees);
  if (findings.length > 0) fail(findings.join('\n'));

  fs.appendFileSync(LOG_PATH(), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  console.log(`appended ${events.length} events`);
};

try {
  main();
} catch (error) {
  if (error instanceof EventError) fail(error.message);
  throw error;
}
