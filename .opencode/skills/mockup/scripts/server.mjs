// モックアップdevサーバーの起動・停止を管理するスクリプト。
// ポートの決め打ちを禁止し、実際のURLを常に出力する。PIDファイルでライフサイクルを追跡する。
// セッション終了時は必ず stop を呼ぶ（ゾンビサーバー防止）。使い方:
//   node scripts/server.mjs serve   # devサーバーを起動し、実際のURLを出力する
//   node scripts/server.mjs stop    # 起動済みのdevサーバーを停止する（プロセスグループごと）
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workbench = join(skillRoot, 'workbench');
const pidFile = join(workbench, '.dev.pid');
const logFile = join(workbench, '.dev.log');

const sleep = (ms) => new Promise((resolveDone) => setTimeout(resolveDone, ms));

// detached 起動の子プロセスは独立プロセスグループを持つため、グループごと殺せる
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killGroup = (pid) => {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
};

const serve = async () => {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    if (isAlive(pid)) {
      console.log(`[mockup] already running (pid ${pid}). current url is in .dev.log`);
      return;
    }
    rmSync(pidFile);
  }

  // ログは今回のセッション専用に切り詰める（古いポート検出を防ぐ）
  const out = openSync(logFile, 'w');
  const child = spawn('pnpm', ['dev'], {
    cwd: workbench,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  writeFileSync(pidFile, String(child.pid));

  // vite の出力から実際のポートを読み取る（他プロジェクトのサーバーと混同しないため）
  let url = '';
  for (let i = 0; i < 40 && url === ''; i += 1) {
    await sleep(250); // eslint-disable-line no-await-in-loop -- 起動待ちのポーリングは逐次でなければ意味がない
    const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
    const match = log.match(/localhost:(\d+)\/\s*$/m) ?? log.match(/localhost:(\d+)/);
    if (match) url = `http://localhost:${match[1]}`;
  }

  if (url === '') {
    // 検出失敗時もゾンビとstale pidfileを残さない
    killGroup(child.pid);
    rmSync(pidFile, { force: true });
    console.error(`[mockup] failed to detect the served url. server killed. check ${logFile}`);
    process.exit(1);
  }
  console.log(`[mockup] serving at ${url} (pid ${child.pid})`);
};

const stop = () => {
  if (!existsSync(pidFile)) {
    console.log('[mockup] no running server recorded.');
    return;
  }
  const pid = Number(readFileSync(pidFile, 'utf8'));
  if (isAlive(pid)) killGroup(pid);
  rmSync(pidFile);
  console.log(`[mockup] stopped (pid ${pid})`);
};

const command = process.argv[2];
if (command === 'serve') await serve();
else if (command === 'stop') stop();
else {
  console.error('usage: node scripts/server.mjs serve|stop');
  process.exit(1);
}
