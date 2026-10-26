# Deno and Bun runtime detector

Detector id: `deno` · Parser: `src/detectors/deno/parse.ts` · Registry: `registry/deno.json` · Fixtures: `tests/fixtures/deno/`

The Deno detector inspects repositories for pinned Deno and Bun runtime versions in configuration and version files.

## What it reads

The detector searches for and parses the following files:

- `deno.json` and `deno.jsonc`: reads exact runtime version pins declared in `"deno"`, `"bun"`, `"runtime"`, or `"engines"`.
- `bunfig.toml`: reads exact Bun runtime version pins declared in top-level or `[runtime]`, `[bun]`, `[install]` sections (`version`, `bun`, `bunVersion`, `runtime`).
- `.bun-version`: reads exact Bun runtime version pins declared on the first non-comment line.

Each exact version pin is matched against reviewed lifecycle rules for `pkg:generic/deno` and `pkg:generic/bun`.

## Rules

Rules in `registry/deno.json` use versioned, authoritative release sources:

- **Deno 1.x (end-of-life)**: Deno 1.x reached end-of-life following the Deno 2.0 release. Sourced from [Deno 2.0.0 Release](https://github.com/denoland/deno/releases/tag/v2.0.0).
- **Deno 0.x (end-of-life)**: Pre-release Deno versions are obsolete. Sourced from [Deno 1.0.0 Release](https://github.com/denoland/deno/releases/tag/v1.0.0).
- **Bun 1.0.x (end-of-life)**: Bun 1.0.x reached end-of-life following Bun 1.1. Sourced from [Bun 1.1.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0).
- **Bun 0.x (end-of-life)**: Pre-release Bun versions are obsolete. Sourced from [Bun 1.0.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.0.0).

## Limits

- **Exact pins only**: Version ranges (e.g. `^1.0.0`, `>=1.0.0`), wildcard/floating versions (`1.x`, `1.0.*`), environment variables (`$DENO_VERSION`), and `latest` produce no finding.
- **Offline & Pure**: The detector reads repository files and bundled rules only. It never executes repository code, invokes external commands, or accesses the network.
