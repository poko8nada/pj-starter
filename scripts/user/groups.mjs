// スターターの設定ファイル群のグループ定義。apply / new が対象を選んで使う唯一の正本。
// 項目の意味は apply/files.mjs の単位定義と同じ。
// id: グループ識別子 / label: 用法表示用 / paths: 同期するディレクトリ（files があればそちらが優先）
// files: paths 配下の指定ファイルのみ同期 / excludes: 同期対象外（削除からも保護）
// create: 複写ではなく空生成するファイル（new のみ）
// tools: このグループを使うツール ('apply' = 更新配布, 'new' = 新規立ち上げ)
export const GROUPS = [
  {
    id: 'harness',
    label: 'harness',
    paths: ['.opencode/lib', '.opencode/plugin'],
    tools: ['apply', 'new'],
  },
  { id: 'agents', label: 'agents', paths: ['.opencode/agent'], tools: ['apply', 'new'] },
  { id: 'skills', label: 'skills', paths: ['.opencode/skills'], tools: ['apply', 'new'] },
  {
    id: 'config',
    label: 'config',
    paths: ['.opencode'],
    files: ['tsconfig.json', 'package.json', '.gitignore'],
    tools: ['apply', 'new'],
  },
  // new 自身は配布物に含めない（new はスターター側の道具）。basename 一致で除外する
  {
    id: 'scripts',
    label: 'scripts',
    paths: ['scripts'],
    excludes: ['new.mjs', 'new/', 'new.test.mjs', 'NEW.md'],
    tools: ['apply', 'new'],
  },
  {
    id: 'events',
    label: 'events',
    paths: ['events'],
    excludes: ['log.jsonl', 'checkpoint.json', 'snapshots/'],
    tools: ['apply', 'new'],
  },
  {
    id: 'docs',
    label: 'docs',
    paths: ['.'],
    files: ['AGENTS.md', 'lefthook.yaml', '.gitattributes'],
    tools: ['apply', 'new'],
  },
  // lint は両ツールで使う。以降は new のみ（新規立ち上げで運ぶ）。apply の更新配布には含めない
  {
    id: 'lint',
    label: 'lint',
    paths: ['.'],
    files: ['.oxlintrc.json', '.oxfmtrc.json'],
    tools: ['apply', 'new'],
  },
  {
    id: 'node',
    label: 'node',
    paths: ['.'],
    files: ['package.json', 'tsconfig.json'],
    tools: ['new'],
  },
  {
    id: 'test',
    label: 'test',
    paths: ['.'],
    files: ['vitest.config.ts'],
    tools: ['new'],
  },
  {
    id: 'workspace',
    label: 'workspace',
    paths: ['.'],
    files: ['pnpm-workspace.yaml'],
    tools: ['new'],
  },
  {
    id: 'env',
    label: 'env',
    paths: ['.'],
    files: ['.envrc'],
    tools: ['new'],
  },
  {
    id: 'gitignore',
    label: 'gitignore',
    paths: ['.'],
    files: ['.gitignore'],
    tools: ['new'],
  },
  // 複写ではなく空生成するファイル（new のみ）
  { id: 'readme', label: 'readme', create: ['README.md', 'README.ja.md'], tools: ['new'] },
];

// 指定ツールが対象にするグループだけを返す
export const groupsFor = (tool) => GROUPS.filter((group) => group.tools.includes(tool));
