---
title: Starter kit — Next.js
---

# Starter kit: Next.js

A copy-paste setup that checks the Node.js runtime, the Next.js version, and GitHub Actions in a Next.js repository. Scans stay offline: the Action and CLI read the repository and bundled lifecycle data only.

**Example:** [arminazimi/evergreen-starter-nextjs](https://github.com/arminazimi/evergreen-starter-nextjs) runs this kit in CI.

## What it checks

| Surface | Typical evidence | Why it matters for Next.js |
| --- | --- | --- |
| Node.js runtime | `package.json` `engines`, `.nvmrc`, `.node-version`, CI `setup-node` | Next.js majors require a supported Node line; an end-of-life runtime fails the gate. |
| Next.js package | `dependencies` / `devDependencies` on `next` | Unsupported majors (for example Next.js 15 after its support window) are high severity. |
| GitHub Actions | `.github/workflows/*.yml` `uses:` pins | Deprecated or retired Actions in the app’s own CI show up next to app dependencies. |

Use a supported Next.js major (Active LTS) and Node.js 22 or later before you turn the gate on. Check a candidate with:

```bash
npx evergreen-deprecation check pkg:npm/next@16.0.0
npx evergreen-deprecation check pkg:generic/nodejs@22.0.0
```

## 1. Pull-request workflow

Copy [`examples/starters/nextjs/.github/workflows/evergreen.yml`](https://github.com/arminazimi/evergreen/blob/main/examples/starters/nextjs/.github/workflows/evergreen.yml) to `.github/workflows/evergreen.yml`:

```yaml
name: Evergreen

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  lifecycle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: arminazimi/evergreen@v0.7.1
        with:
          baseline: .evergreen-baseline.json
          fail-on-severity: high
```

`contents: read` is enough. The scan makes no network requests. Pin a release tag (here `v0.7.1`) so every pull request runs the same rules; see [GITHUB_ACTION.md](../GITHUB_ACTION.md) for inputs, SARIF upload, and SHA pins.

## 2. Baseline

Copy [`examples/starters/nextjs/.evergreen-baseline.json`](https://github.com/arminazimi/evergreen/blob/main/examples/starters/nextjs/.evergreen-baseline.json) to the repository root, or generate one from a first scan of findings you have accepted:

```bash
npx evergreen-deprecation baseline . --output .evergreen-baseline.json
```

An empty baseline (as in the kit) fails CI on any high or critical finding. Add an `owner`, `reason`, and `expires` on every accepted entry; see [GITHUB_ACTION.md](../GITHUB_ACTION.md#pull-request-workflow).

## 3. Agent snippet

So coding agents check before they add a package, Action, or runtime, copy the Cursor files from [`examples/starters/nextjs/.cursor/`](https://github.com/arminazimi/evergreen/tree/main/examples/starters/nextjs/.cursor):

1. `.cursor/mcp.json` — local MCP server for `evergreen-deprecation@0.7.1`
2. `.cursor/rules/evergreen.mdc` — always-on rule that calls `check_dependency` first

Restart Cursor and enable the `evergreen` server under Settings → MCP. Other hosts use the same instruction text under [`examples/agents/`](https://github.com/arminazimi/evergreen/tree/main/examples/agents); see [AGENT_SKILLS.md](../AGENT_SKILLS.md).

## Verify locally

```bash
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json --fail-on high
```

Exit code 0 means nothing at or above the gate is uncovered by the baseline. The example repository keeps that command green in GitHub Actions on every push to `main`.
