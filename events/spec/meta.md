# Meta Snapshot Specification

`events/snapshots/meta.json` describes the **driving machinery** of the project: everything that operates the project rather than the output it produces. Generated only by `build.mjs` from `meta.*` events; never hand-authored.

## Boundary definition

> **meta = the machinery that drives and operates the project.**
> **product = the artifacts that machinery produces.**

Practical consequences:

- Agent-executed layers (plugins, skills, driving docs) belong here
- Quality gates (pre-commit enforcement) belong here — they drive how work ships
- Plain tool _configuration files_ are not inventoried individually; they appear only as part of a gate-level entry (see Granularity)

## Sections

The second segment of a `meta.*` key is fixed to these four:

| Section   | Contents                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| `harness` | Hook runtimes and plugin wiring (harness-dependent execution layer), quality gates |
| `skills`  | Skills, including ones merely planned                                              |
| `docs`    | Driving documents (AGENTS.md, events specs)                                        |
| `scripts` | Operational scripts (root `scripts/` and `events/scripts/`)                        |

## Entry shape

Every component leaf carries a `purpose`; that field marks the object as a meta component:

```json
{
  "agenda": {
    "purpose": "Fix the unit of work per feature slice",
    "stage": "planned",
    "status": "未着手"
  }
}
```

| Field       | Rule                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `path`      | Where the component lives. Omit while only planned; set once implemented                                               |
| `purpose`   | One-sentence intent. Required — its presence defines a component leaf                                                  |
| `stage`     | Mechanical pipeline stage: `planned` → `ready` → `commit`. Injected by rebuild (`"planned"` default); omit at creation |
| `status`    | Free-text progress note (what has been done so far). Required — always write the current progress in one sentence      |
| `updatedAt` | Last update date (YYYYMMDD), injected by rebuild from the `ts` of the latest event touching the component              |

A committed component re-enters at `ready` whenever new work on it is agreed — components never close; change cycles do. Keep the stage truthful at all times.

Lifecycle transitions are ordinary `set`s on deep keys, identical to product slices:

```jsonl
{"ts":"…","type":"set","key":"meta.skills.mockup.path","value":".opencode/skills/mockup/SKILL.md"}
{"ts":"…","type":"set","key":"meta.skills.mockup.stage","value":"ready"}
{"ts":"…","type":"set","key":"meta.skills.mockup.status","value":"要件を整理し、実装に着手する"}
```

The rebuild also injects `updatedAt` (YYYYMMDD) on each component — the date its value was last written, derived from the event's `ts`.

## Granularity policy

- **One component = one purpose**, verifiable by **one surface**. An entry whose purpose needs "and" / "etc." is a bundle and must be split into sibling entries at the same depth (the oversized key is removed with `del`)
- Size each change cycle to complete within one working session (`ready → commit`)
- One entry per **entry point or mechanism** (a hook runtime, a skill, a script, a gate). Never per configuration file
- Tool configs (oxlint, oxfmt, tsconfig…) are summarized by their gate entry only — e.g. the pre-commit quality gate is one entry pointing at `lefthook.yaml`
- Library internals are reachable through the entry's `path`; do not enumerate them

## Current starter example

```json
{
  "harness": {
    "quality-gate": {
      "path": "lefthook.yaml",
      "purpose": "コミット時のformat/lint/typecheck強制",
      "stage": "commit",
      "status": "lefthook で pre-commit フックを運用中"
    },
    "tool-execute-after": {
      "path": ".opencode/plugin/tool-execute-after.ts",
      "purpose": "編集直後のreport-only lint",
      "stage": "commit",
      "status": "edit 直後に oxlint を report-only で実行中"
    },
    "session-idle": {
      "path": ".opencode/plugin/session-idle.ts",
      "purpose": "品質レビューとevents同期の順次実行",
      "stage": "commit",
      "status": "idle 時にレビューと同期を Report 合成で実行中"
    }
  },
  "skills": {
    "agenda": {
      "path": ".opencode/skills/agenda/SKILL.md",
      "purpose": "作業単位をfeatureスライス単位で確定する",
      "stage": "commit",
      "status": "実装決定を既存スナップショットから選択して合意する"
    },
    "feature": {
      "path": ".opencode/skills/feature/SKILL.md",
      "purpose": "featureとコンポーネントの登録・分割・定義改訂",
      "stage": "commit",
      "status": "登録・分割・定義改訂を feature スキルで運用中"
    },
    "recon": { "purpose": "実装前の調査と記録", "stage": "planned", "status": "未着手" },
    "audit": {
      "purpose": "生成物をログで絞り込みレビューする",
      "stage": "planned",
      "status": "未着手"
    },
    "mockup": { "purpose": "静的HTMLモックアップの作成", "stage": "planned", "status": "未着手" }
  },
  "docs": {
    "agents-md": {
      "path": "AGENTS.md",
      "purpose": "行動原則と駆動方式への導線",
      "stage": "commit",
      "status": "駆動システムの導線として運用中"
    },
    "events-readme": {
      "path": "events/README.md",
      "purpose": "駆動方式の仕様",
      "stage": "commit",
      "status": "駆動方式の仕様として運用中"
    },
    "product-spec": {
      "path": "events/spec/product.md",
      "purpose": "productスナップショットの仕様",
      "stage": "commit",
      "status": "product スナップショットの仕様として運用中"
    }
  },
  "scripts": {
    "event-append": {
      "path": "events/scripts/append.mjs",
      "purpose": "イベントの追記（単発・バッチ）",
      "stage": "commit",
      "status": "単発・バッチ両対応でイベントを追記中"
    },
    "event-build": {
      "path": "events/scripts/build.mjs",
      "purpose": "スナップショット生成",
      "stage": "commit",
      "status": "ログからスナップショットを生成中"
    },
    "event-compact": {
      "path": "events/scripts/compact.mjs",
      "purpose": "チェックポイント退避",
      "stage": "commit",
      "status": "しきい値超過時にチェックポイントへ退避中"
    },
    "event-read": {
      "path": "events/scripts/read.mjs",
      "purpose": "スナップショットcontentの読み出し",
      "stage": "commit",
      "status": "スナップショットの content を読み出し中"
    },
    "typecheck-staged": {
      "path": "scripts/typecheck-staged.mjs",
      "purpose": "ステージされたファイルだけを型検査",
      "stage": "commit",
      "status": "pre-commit でステージ済みのみ型検査中"
    },
    "sync-config-snapshots": {
      "path": "scripts/sync-config-snapshots.mjs",
      "purpose": "設定スナップショットの同期",
      "stage": "commit",
      "status": "pre-commit で設定スナップショットを同期中"
    }
  }
}
```

## Rebuild behavior

1. Fold `meta.*` events like any namespace
2. Normalize: every leaf carrying `purpose` receives `"stage": "planned"` unless already set
3. Inject `updatedAt` (YYYYMMDD) on each component from the `ts` of its latest event
4. `meta.json` is written only when at least one `meta.*` event exists
