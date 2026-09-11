// 新規立ち上げの scaffold 複写。new タグのグループを起点から対象へ運ぶ（apply 内部は使わない）。
// 除外判定は match.mjs の共有を使う
import fs from 'node:fs';
import path from 'node:path';
import { groupsFor } from '../groups.mjs';
import { isSkippedPath } from '../match.mjs';

const walkFiles = (dir, base = dir) => {
  const out = [];
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of list) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs, base));
    else out.push(path.relative(base, abs));
  }
  return out;
};

export const copyScaffold = (starter, target) => {
  for (const group of groupsFor('new')) {
    if (!group.paths) continue; // create 系は別工程
    for (const unitPath of group.paths) {
      const src = path.join(starter, unitPath);
      if (group.files) {
        for (const file of group.files) {
          const from = path.join(src, file);
          if (!fs.existsSync(from)) continue;
          const to = path.join(target, unitPath, file);
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(from, to);
          console.log(`複写: ${unitPath}/${file}`);
        }
        continue;
      }
      if (!fs.existsSync(src)) continue;
      for (const rel of walkFiles(src)) {
        if (isSkippedPath(rel, group.excludes ?? [])) continue;
        fs.mkdirSync(path.join(target, unitPath, path.dirname(rel)), { recursive: true });
        fs.copyFileSync(path.join(src, rel), path.join(target, unitPath, rel));
        console.log(`複写: ${unitPath}/${rel}`);
      }
    }
  }
};
