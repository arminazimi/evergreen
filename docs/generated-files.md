# Generated files

This page lists every committed file that a tool produces, what produces it, who reads it, and where it should live. It is the inventory to check before moving any of them. The rules for editing them are in [AGENTS.md](../AGENTS.md#generated-files--do-not-edit-by-hand).

Churn is the number of commits in the month to 2026-11-01 that touched the path. It shows which outputs cause the most merge conflicts and review noise.

Targets:

- **Build time**: generate during `npm run build` (or before it) and do not commit.
- **Release time**: generate only in the release pull request.
- **Keep**: commit the output, because something reads it straight from the repository, and keep a check that fails on drift.

## Outputs in the lifecycle and site pipeline

| Path | Generator | Read by | Churn (30 days) | Needed by | Target |
|---|---|---|---|---|---|
| `docs/rules/` per-rule pages | `npm run build:reference` (`tools/build-reference-pages.ts`, source `registry/*.json`) | Pages site (rule pages, linked from `docs/RULES.md`), `tests/reference-pages.test.ts`, agents reading rule URLs | 121 | Pages, tests, agents | Keep. The Pages workflow builds from these committed files. |
| `docs/rules/index.md`, `docs/sitemap.xml` | `npm run build:reference` / `--site` (`tools/build-reference-pages.ts`); also the Pages workflow before Jekyll | Pages artifact (`/rules/`, `/sitemap.xml` for Search Console), `tests/reference-pages.test.ts`, `tests/site-urls.test.ts` | (shared with `docs/rules/`) | Pages, Search Console | Build time. Gitignored; no pull request commits them. `check:reference` skips their on-disk content and still drifts the committed rule pages. |
| `docs/eol/` (51 files) | `npm run build:answer-pages` (`tools/build-answer-pages.ts`, source `registry/*.json`) | Pages site (answer pages), `tests/answer-pages.test.ts` | 4 | Pages, tests | Keep, for the same reason as `docs/rules/`. |
| `docs/assets/og/` (706 SVGs) | `npm run build:og-images` (`tools/build-og-images.ts`, source `registry/*.json`) | Social-preview meta tags on the Pages site | 24 | Pages | Keep. |
| `docs/api/v1/` (1,123 files) | `npm run build:data-api` (`tools/build-data-api.ts`, source `registry/`); also the Pages workflow before Jekyll | Static API served by Pages, `tests/openapi.test.ts` (checks against `docs/api/openapi.yaml`) | 49 | Pages, tests, agents that call the API | Build time. Gitignored; no pull request commits it. `check:data-api` verifies it is buildable and schema-valid. |
| `docs/llms-full.txt` | `npm run build:llms` (`tools/build-llms-full.ts`, source: pages linked from `docs/llms.txt`); also the Pages workflow before Jekyll | Agents (`docs/llms.txt` points to the public URL), Pages artifact, `tests/llms.test.ts` | 285 | Agents, Pages, tests | Build time. Gitignored; no pull request commits it. `check:llms` verifies it is buildable. |
| `docs/ROADMAP.md` | `node planning/roadmap/roadmap-md.mjs` (source `planning/roadmap/`) | Pages site, contributors, `.github/workflows/ci.yml` (treats it as generated) | 25 | Pages, contributors | Keep. |
| `docs/dashboard/data.json` | `npm run build:dashboard` (`tools/build-dashboard-data.ts`), also run by `record:corpus-run` and the Pages workflow before Jekyll | Dashboard page (`docs/dashboard/dashboard.js`), `tests/dashboard-data.test.ts` | 61 | Pages, tests | Build time. Gitignored; no pull request commits it. `check:dashboard` verifies it is buildable. |
| `docs/differential-report.json`, `docs/differential-report.md` | `npm run differential:report` (`benchmarks/differential/report.ts`, `--check` mode) | Pages site (`docs/differential-report.md` links to the JSON) | 2 | Pages | Keep. Not part of `npm run check`, so its drift check runs only when someone runs it. |

## Outputs that code and packages consume

| Path | Generator | Read by | Churn (30 days) | Needed by | Target |
|---|---|---|---|---|---|
| `src/commands/index.generated.ts` | `node tools/generate-commands-index.mjs` (`--check` runs in `npm run check`, step `check:commands`) | `src/cli-main.ts`, `src/completions.ts`, `tests/cli-registry.test.ts` | 1 | npm package, tests | Build time. It is a TypeScript input to `tsc`, so the build can generate it before compiling. Keep the drift check. |
| `plugins/claude/` | `npm run build:plugins` (`tools/plugin-packages.ts`, source `skills/`) | Claude Code plugin hosts (installed from the repository), `tests/plugin-packaging.test.ts`, `npm run check:plugins` | 25 (`plugins/`) | Agents (plugin hosts), tests | Keep. Hosts install from the repository. |
| `plugins/codex/` | `npm run build:plugins` (`tools/plugin-packages.ts`, source `skills/`) | Codex plugin hosts, `tools/validate-codex-plugin.ts` | 25 (`plugins/`, shared) | Agents (plugin hosts), tests | Keep. |
| `.claude-plugin/marketplace.json` | `npm run build:plugins` | Claude Code marketplace install | 9 | Agents (plugin hosts) | Keep. |
| `.agents/plugins/marketplace.json` | `npm run build:plugins` | Codex marketplace install | 1 | Agents (plugin hosts) | Keep. |
| `src/usage/vendor/tree-sitter/*.wasm.b64`, `manifest.json` | `node dist/tools/sync-tree-sitter-wasm.js` (source: an installed `@vscode/tree-sitter-wasm@0.3.1`; `tools/verify-tree-sitter-wasm.ts` checks the payloads offline) | `src/usage/tree-sitter.ts`, `tests/tree-sitter-vendor.test.ts`, `tests/package-contents.test.ts` | new | npm package, tests | Keep. The loader decodes the base64 payloads at runtime, so they must ship. |
| `dist/action/index.js` | `npm run build:action` (`ncc`), on the `release/<tag>` branch by the Release workflow | `action.yml`, GitHub Action consumers, `tests/data-age.test.ts` (through `dist/src/action.js`), `npm run check:action-bundle` (with `EVERGREEN_VERIFY_ACTION_BUNDLE=1`, on a release tag) | 117 | Action | Release time, off `main`. `main` does not carry it and no pull request commits it; release tags point at a `release/<tag>` commit that adds it. |
| `CHANGELOG.md` | `node dist/tools/changelog.js --write` (`tools/changelog.ts`), at release | Release readers, `docs/CHANGELOG.md` | 164 | Release readers | Release time. A pull request adds a fragment under `changes/` instead; CI (`generated-files`) refuses any edit to this file unless the pull request title starts with `chore: release`. |

## Dated snapshots

These files are records, not outputs of a build. Each tool writes one per run.

| Path | Generator | Read by | Churn (30 days) | Needed by | Target |
|---|---|---|---|---|---|
| `metrics/adoption/*.json` | `npm run metrics:adoption` (`tools/adoption-metrics.ts`) | `tools/monthly-report.ts`, `tests/adoption-metrics.test.ts`, `docs/ADOPTION.md` | 5 (`metrics/`, shared) | Maintainers | Keep. Each file is a dated record. |
| `metrics/quality/*.json` | `npm run metrics:quality` (`tools/quality-metrics.ts`) | `tools/monthly-report.ts`, `tests/quality-metrics.test.ts`, `docs/QUALITY.md` | (shared above) | Maintainers | Keep. Each file is a dated record. |
| `metrics/discovery/*.json` | `node dist/benchmarks/agent-discovery-probe.js --out …` (`benchmarks/agent-discovery-probe.ts`) | `docs/BENCHMARKS.md`, `tests/agent-discovery-probe.test.ts` | (shared above) | Maintainers | Keep. |
| `docs/reports/monthly-*.md` | `npm run report:monthly -- --out …` (`tools/monthly-report.ts`) | `docs/QUALITY.md`, `tests/monthly-quality-report.test.ts` | 0 | Maintainers | Keep. One published report per month. |
| `reports/self-scan-2026-10.md` | Written by a maintainer, one per month (`reports/README.md`) | `docs/ADOPTION.md` | 2 (`reports/`) | Maintainers | Keep. Not regenerated by a tool. |

## Not generated by this repository

These files look generated but have no generator in the repository. Do not add one without a reason.

| Path | Why it is not generated |
|---|---|
| `docs/RULES.md` | Hand-written reference. Links into `docs/rules/`. |
| `docs/_data/navigation.yml` | Hand-edited site navigation (8 commits in the last month). No script writes it. |
| `docs/api/openapi.yaml` | Hand-written API description. No generator writes it. `tests/openapi.test.ts` checks it. |
| `schemas/vendor/` | Vendored third-party schema. Excluded from the npm package. |
| `examples/**` and `tests/fixtures/**` lock files | Fixtures and examples. Some are generated by package managers once, then committed as test data. |

## Who needs what

- **Pages site** (`docs/`, Jekyll): every `docs/` output above. [pages.yml](../.github/workflows/pages.yml) builds `docs/` and deploys the `_site` artifact. Most generated Markdown still lives in the repository for that build; `docs/llms-full.txt`, `docs/sitemap.xml`, `docs/rules/index.md`, `docs/dashboard/data.json`, and `docs/api/v1/` are the exceptions — the workflow generates them before Jekyll so the public URLs stay without commit churn.
- **npm package** (`package.json` `files`): `dist/src`, `registry/`, `schemas/`, `skills/`, and `examples/` (minus excluded demos). It does not include `docs/`, `plugins/`, or `metrics/`.
- **GitHub Action** (`action.yml`): `dist/action/index.js` only, from the release tag's commit, not from `main`.
- **Tests**: all the drift checks named in the tables. `npm run check` runs the build, the Action bundle, the test suite, `check:commands`, `check:plugins`, and the plugin and agent-loop evals. Drift checks for the registry-generated outputs run inside the test suite.
- **Agents**: `docs/llms.txt` and the published `llms-full.txt` URL, `skills/`, `plugins/`, `.claude-plugin/`, `.agents/`, and the `docs/api/v1/` static API.

## Follow-ups

These are not part of this inventory. Each one should be its own issue.

1. Move `src/commands/index.generated.ts` to build time (generate before `tsc`).
2. Add `CHANGELOG.md` to the generated-files table in AGENTS.md.
3. Make `docs/differential-report.*` part of a drift check.
