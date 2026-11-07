# Deno and Bun runtime detector

Detector id: `deno` · Parser: `src/detectors/deno/parse.ts`, `src/detectors/deno/parse-tool-versions.ts` · Registry: `registry/deno.json` · Fixtures: `tests/fixtures/deno/`

The Deno detector inspects repositories for pinned Deno and Bun runtime versions in configuration and version files. It is **supported**: its level is recorded as `stable` in `benchmarks/thresholds.json`, it is scored on the [public corpus](../VALIDATION.md), and it is held to the corpus precision and recall floors (see [Decision 0013](../decisions/0013-detector-maturity.md)). The Bun capability uses the same detector, so both are `stable` in `src/capabilities.ts`.

## What it reads

The detector searches for and parses the following files:

- `deno.json` and `deno.jsonc`: reads exact runtime version pins declared in `"deno"`, `"bun"`, `"runtime"`, or `"engines"`.
- `bunfig.toml`: reads exact Bun runtime version pins declared in top-level or `[runtime]`, `[bun]`, `[install]` sections (`version`, `bun`, `bunVersion`, `runtime`).
- `.bun-version`: reads an exact Bun runtime version pin on the first non-comment line.
- `.tool-versions`: reads an exact `deno` or `bun` pin managed by asdf. A line may list more than one version (`bun 1.0.29 0.8.1`), and every pinned version is judged.

Each exact version pin is matched against reviewed lifecycle rules for `pkg:generic/deno` and `pkg:generic/bun`.

## Rules

Rules in `registry/deno.json` use versioned, authoritative release sources:

- **Deno 1.x (end-of-life)**: Deno 1.x reached end-of-life following the Deno 2.0 release. Sourced from [Deno 2.0.0 Release](https://github.com/denoland/deno/releases/tag/v2.0.0).
- **Deno 0.x (end-of-life)**: Pre-release Deno versions are obsolete. Sourced from [Deno 1.0.0 Release](https://github.com/denoland/deno/releases/tag/v1.0.0).
- **Bun 1.0.x (end-of-life)**: Bun 1.0.x reached end-of-life following Bun 1.1. Sourced from [Bun 1.1.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.1.0).
- **Bun 0.x (end-of-life)**: Pre-release Bun versions are obsolete. Sourced from [Bun 1.0.0 Release](https://github.com/oven-sh/bun/releases/tag/bun-v1.0.0).

## Limits

- **Exact pins only**: Version ranges (e.g. `^1.0.0`, `>=1.0.0`), wildcard/floating versions (`1.x`, `1.0.*`), two-component pins (`bun 1.0`), environment variables (`$DENO_VERSION`), `system`, and `latest` produce no finding. A `.tool-versions` line with one unsupported token produces no finding for that line.
- **Files it does not read**: `.deno-version`, a `package.json` `packageManager` field or `engines` block, `requiredBunVersion` in `bunfig.toml`, a package `"version"` that is not one of the runtime keys above, Docker images (`FROM denoland/deno:…`, `FROM oven/bun:…`), and CI pins (`deno-version:` or `bun-version:` under `denoland/setup-deno` or `oven-sh/setup-bun`). Several corpus repositories contain those lines beside a judged `.tool-versions` pin; the image and workflow lines stay unjudged.
- **Offline & Pure**: The detector reads repository files and bundled rules only. It never executes repository code, invokes external commands, or accesses the network.

## Validation

Sixty-nine new blind repositories cover the detector, 65 with reviewed Deno or Bun findings and four with none. A narrowed offline run of the `deno` ecosystem on 2026-11-08 reported 71 true positives, no false positives, and no false negatives for the detector (including the two pins that predate this pass), precision 1 and recall 1.

The corpus holds 71 Deno-ecosystem repositories: 67 with findings (65 new, plus `starlink-awaken/StrategyManager` and `DominikDolejsi/PokeAppBackend`), 71 expected `deno` findings (69 new — 35 Deno 1.x and 34 Bun 1.0.x or 0.x — plus the two earlier pins), and four zero-finding controls (`mob-sakai/unity-changeset`, `ericyd/salamivg`, `bee-browser/bee`, and `horvathandris/dime`). All 71 were selected blind, and the Deno/Bun split of the new findings is 33 repositories for Deno and 32 for Bun.

The selection rule, the exact queries, and the Docker and CI boundary are in [Validation](../VALIDATION.md#deno-and-bun-corpus).
