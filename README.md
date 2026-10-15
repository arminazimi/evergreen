# Evergreen

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png">
    <img alt="Evergreen — Know what breaks next." src="https://raw.githubusercontent.com/arminazimi/evergreen/main/brand/exports/banner-light.png" width="100%">
  </picture>
</p>

[![CI](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml/badge.svg)](https://github.com/arminazimi/evergreen/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/evergreen-deprecation.svg)](https://www.npmjs.com/package/evergreen-deprecation)
[![skills.sh](https://skills.sh/b/arminazimi/evergreen)](https://skills.sh/arminazimi/evergreen/evergreen-deprecation)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Evergreen is local-first deprecation intelligence for software repositories. It connects upcoming ecosystem changes to the exact files they affect and produces evidence-backed migration context for humans and coding agents.

Version 0.1 includes GitHub Actions, Node.js, npm, and Python lifecycle detectors. Read the [public documentation](https://arminazimi.github.io/evergreen/), run the [90-second demo](docs/DEMO.md), or inspect the [v0.1 validation report](docs/VALIDATION.md).

## Product principles

- Local-first: source code stays on the user's machine or CI runner.
- Deterministic core: findings do not require an LLM.
- Evidence-backed: every deprecation claim links to an authoritative source.
- Agent-ready: every human-readable report has a machine-readable equivalent.
- Extensible: ecosystems are added through detectors rather than core rewrites.

## Quickstart

Requirements: Node.js 22 or newer.

```bash
npx evergreen-deprecation scan .
```

Verify that the CLI, local MCP server, Agent Skill, plugin foundations, and CI
workspace are ready without changing configuration or uploading repository data:

```bash
npx evergreen-deprecation doctor .
npx evergreen-deprecation doctor . --json
```

See the [public compatibility matrix](docs/COMPATIBILITY.md) for supported,
experimental, and unsupported combinations.

Discover Evergreen's versioned capabilities and entry points programmatically:

```bash
npx evergreen-deprecation capabilities --json
```

The [auto-discovery contract](docs/CAPABILITIES.md) defines the shared identifiers
used by the CLI, MCP server, Agent Skill, plugins, and CI integrations.

Create a baseline for accepted existing findings, then report only new lifecycle regressions:

```bash
npx evergreen-deprecation baseline .
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json
```

Inspect the evidence and migration direction for one result:

```bash
npx evergreen-deprecation explain '<finding-id>' .
```

Generate portable migration context for a human or coding agent:

```bash
npx evergreen-deprecation context '<finding-id>' . --json
```

Migration packets contain rule-specific constraints and steps, exact affected files and usages, authoritative sources, and suggested verification commands. Evergreen never executes those commands automatically. See the [migration packet guide](docs/MIGRATION_PACKETS.md).

Connect a coding agent through the local MCP server:

```bash
npx --yes --package evergreen-deprecation evergreen-mcp
```

The stdio server exposes `scan_repository`, `list_deprecations`, `explain_deprecation`, `create_migration_context`, and `verify_migration`. See the [local MCP guide](docs/MCP.md) for host configuration, the intended workflow, and privacy guarantees.

## Agent Skill

Install the vendor-neutral Agent Skill from the monorepo:

```bash
npx skills add arminazimi/evergreen
```

Pull future revisions with:

```bash
npx skills update evergreen-deprecation
```

The [`evergreen-deprecation` Skill](skills/evergreen-deprecation/README.md) teaches discovery, explanation, migration, and verification while leaving detection and migration logic inside Evergreen. It is discoverable on [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation) and has been install-validated for Codex, Claude Code, Cursor, GitHub Copilot, and Gemini CLI. See the [Agent Skill guide](docs/AGENT_SKILLS.md) for evaluation, compatibility, limits, and security assumptions.

Codex and Claude plugin packages are generated from that same Skill and MCP workflow. Their [packaging architecture](docs/PLUGIN_PACKAGING.md) keeps host manifests thin and fails CI when either package drifts from the canonical sources.
The [cross-host evaluation](docs/PLUGIN_EVALS.md) publishes shared-corpus results, context budgets, permission behavior, and security limitations; the same checks block release regressions in `npm run check`.

Evergreen runs locally and does not upload repository contents.

## Development

```bash
npm install
npm run check
```

The initial detector reports unsupported major versions of five first-party actions with exact file and line locations:

- `actions/checkout`
- `actions/setup-node`
- `actions/cache`
- `actions/upload-artifact`
- `actions/download-artifact`

Pinned commit SHAs and dynamic expressions are intentionally left unclassified until Evergreen can resolve them without guessing.

The npm detector also reads `package.json`, npm/pnpm/Yarn lockfiles, Node.js runtime declarations, and a small evidence-backed registry of deprecated direct dependencies. Use `evergreen explain <finding-id>` to inspect a finding and its sources.

The Python detector reads PEP 621 and Poetry metadata from `pyproject.toml`, `requirements*.txt`, common runtime-version files, and uv/Poetry/PDM/Pipenv lockfiles. It reports unsupported Python declarations and lifecycle risks in direct dependencies while ignoring transitive-only lockfile entries.

## Source usage analysis

Package lifecycle findings now include the concrete imports, calls, and configuration keys that make a migration necessary. Matching is language-aware and alias-aware for JavaScript, TypeScript, and Python, with configuration-key support for JSON, YAML, TOML, INI, and Python settings. Each match includes its exact file, line, column, and source excerpt, plus a migration-impact estimate based on affected usages and files.

The analyzer scans the repository once for a batch of detector contracts and ignores generated, dependency, build, and environment directories. Run the repeatable accuracy and scan-time benchmark with:

```bash
npm run benchmark:usage
```

See [the benchmark notes](docs/BENCHMARKS.md) for the corpus and interpretation.

## GitHub Action

Evergreen can annotate pull requests, suppress accepted findings with a baseline, fail on a chosen severity, and upload the complete JSON report:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v7
  - uses: arminazimi/evergreen@v0.1.0
    with:
      baseline: .evergreen-baseline.json
      fail-on-severity: high
```

Pin a full commit SHA instead of a version tag when your threat model requires immutable third-party action references. See the [GitHub Action guide](docs/GITHUB_ACTION.md) for setup, inputs, permissions, artifacts, and privacy boundaries.

## Detector SDK

External detectors can use the versioned interface exported by `evergreen-deprecation/sdk`. The scan engine composes compatible detectors without importing any built-in implementation.

See the [detector authoring guide](docs/DETECTORS.md) and the [minimal detector example](examples/detectors/todo-comments.ts).

## Initial product shape

The CLI is the product. Detectors extend it, GitHub Actions automate it, and the local MCP server exposes it to agents. A hosted backend is intentionally outside the roadmap; lifecycle data updates through a signed, offline-verifiable data channel instead.

See [the roadmap](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), [brand guide](brand/BRAND_GUIDE.md), and [contribution guide](CONTRIBUTING.md).

## Community

Questions, ideas, and things you built with Evergreen belong in [GitHub Discussions](https://github.com/arminazimi/evergreen/discussions): use **Q&A** to ask, **Ideas** to propose, and **Show and tell** to share. Use issues for bugs, lifecycle rule requests, and ecosystem requests.

## License and brand

Evergreen source code is licensed under the [Apache License 2.0](LICENSE). The
Evergreen name, logo, and files in [`brand/`](brand/) are proprietary brand assets
and are covered by separate [brand asset terms](brand/LICENSE.md).
