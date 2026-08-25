English | [日本語](./README.ja.md)

# Project Starter

![Node.js](https://img.shields.io/badge/node-22%2B-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-%5E6.0-blue)
![pnpm](https://img.shields.io/badge/pnpm-11%2B-orange)

A project starter for product-driven development — copy it and replace the product definition with your own.

## Description

This repository is a starting point for projects whose state is driven by an event log: the product definition (name, stack, features, roadmap) lives under [events/](./events/README.md) as append-only facts, and documents like this README are derived from them rather than hand-maintained.

Copy the whole starter into a new project, then overwrite the bundled product definition with your own. A pre-commit quality gate (format / lint / typecheck via lefthook) is already wired up.

## Install

```bash
pnpm install
```

Git hooks are installed automatically by the `prepare` script.

## Usage

Run the quality gate:

```bash
pnpm lint
pnpm typecheck
pnpm test:run
```

All three should pass on a fresh checkout.

Read the current product definition — the core loop of the driving system:

```bash
node events/scripts/read.mjs --name product
```

Expected output (abridged):

```json
{"name":{"value":"Project Starter","status":{...}},"what":{"value":"…"}, ...}
```

The driving system itself is specified in [events/README.md](./events/README.md).

## Contributing

This is a personal starter template; there is no contribution guide yet.

## License

<!-- TODO: Add a LICENSE file and update this section -->

No license has been specified yet.

See [AGENTS.md](./AGENTS.md) for AI coding instructions.
