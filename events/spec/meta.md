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
    "status": "planned",
    "isDone": false
  }
}
```

| Field     | Rule                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `path`    | Where the component lives. Omit while only planned; set once implemented                                                  |
| `purpose` | One-sentence intent. Required — its presence defines a component leaf                                                     |
| `status`  | Pipeline stage: `planned` → `implement` → `audit` → `commit`. Injected by rebuild (`"planned"` default); omit at creation |
| `isDone`  | Boolean completion. Injected by rebuild (`false` default); independent of `status`                                        |

Lifecycle transitions are ordinary `set`s on deep keys, identical to product slices:

```jsonl
{"ts":"…","type":"set","key":"meta.skills.mockup.path","value":".opencode/skills/mockup/SKILL.md"}
{"ts":"…","type":"set","key":"meta.skills.mockup.status","value":"implement"}
```

## Granularity policy

- One entry per **entry point or mechanism** (a hook runtime, a skill, a script family, a gate). Never per configuration file
- Tool configs (oxlint, oxfmt, tsconfig…) are summarized by their gate entry only — e.g. the pre-commit quality gate is one entry pointing at `lefthook.yaml`
- Library internals are reachable through the entry's `path`; do not enumerate them

## Current starter example

```json
{
  "harness": {
    "quality-gate": {
      "path": "lefthook.yaml",
      "purpose": "コミット時のformat/lint/typecheck強制",
      "status": "commit",
      "isDone": true
    },
    "tool-execute-after": {
      "path": ".opencode/plugin/tool-execute-after.ts",
      "purpose": "編集直後のreport-only lint",
      "status": "commit",
      "isDone": true
    },
    "session-idle": {
      "path": ".opencode/plugin/session-idle.ts",
      "purpose": "品質レビューとevents同期の順次実行",
      "status": "commit",
      "isDone": true
    }
  },
  "skills": {
    "agenda": {
      "purpose": "作業単位をfeatureスライス単位で確定する",
      "status": "planned",
      "isDone": false
    },
    "recon": { "purpose": "実装前の調査と記録", "status": "planned", "isDone": false },
    "audit": {
      "purpose": "生成物をログで絞り込みレビューする",
      "status": "planned",
      "isDone": false
    },
    "mockup": { "purpose": "静的HTMLモックアップの作成", "status": "planned", "isDone": false }
  },
  "docs": {
    "agents-md": {
      "path": "AGENTS.md",
      "purpose": "行動原則と駆動方式への導線",
      "status": "commit",
      "isDone": true
    },
    "events-readme": {
      "path": "events/README.md",
      "purpose": "駆動方式の仕様",
      "status": "commit",
      "isDone": true
    },
    "product-spec": {
      "path": "events/spec/product.md",
      "purpose": "productスナップショットの仕様",
      "status": "commit",
      "isDone": true
    }
  },
  "scripts": {
    "event-scripts": {
      "path": "events/scripts/",
      "purpose": "イベント追記・生成・圧縮",
      "status": "commit",
      "isDone": true
    },
    "typecheck-staged": {
      "path": "scripts/typecheck-staged.mjs",
      "purpose": "ステージされたファイルだけを型検査",
      "status": "commit",
      "isDone": true
    },
    "sync-config-snapshots": {
      "path": "scripts/sync-config-snapshots.mjs",
      "purpose": "設定スナップショットの同期",
      "status": "commit",
      "isDone": true
    }
  }
}
```

## Rebuild behavior

1. Fold `meta.*` events like any namespace
2. Normalize: every leaf carrying `purpose` receives `"status": "planned"` / `"isDone": false` unless already set
3. `meta.json` is written only when at least one `meta.*` event exists
