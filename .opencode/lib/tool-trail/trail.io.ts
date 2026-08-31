import fs from 'node:fs';
import type { TrailEvent } from './trail';

export const isLastLineTrail = (logPath: string): boolean => {
  if (!fs.existsSync(logPath)) return false;
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return false;
  try {
    const parsed: unknown = JSON.parse(lines.at(-1) ?? '');
    if (typeof parsed !== 'object' || parsed === null || !('key' in parsed)) return false;
    const key = (parsed as { key?: unknown }).key;
    return typeof key === 'string' && key.startsWith('log.try.');
  } catch {
    return false;
  }
};

export const replaceLastLine = (logPath: string, merged: TrailEvent): void => {
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty--;
  if (lastNonEmpty < 0) {
    fs.writeFileSync(logPath, `${JSON.stringify(merged)}\n`);
    return;
  }
  lines.splice(lastNonEmpty, 1, JSON.stringify(merged));
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`);
};

export const repairLog = (logPath: string): void => {
  if (!fs.existsSync(logPath)) return;
  const text = fs.readFileSync(logPath, 'utf8');
  const rawLines = text.split('\n');
  const kept = rawLines.filter((line) => {
    if (line.trim() === '') return false;
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });
  if (kept.length === rawLines.length) return;
  fs.writeFileSync(logPath, kept.length === 0 ? '' : `${kept.join('\n')}\n`);
};

export const appendTrailEvent = (logPath: string, event: TrailEvent): void => {
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`);
};
