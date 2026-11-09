---
title: Runtime dependencies
description: Why Evergreen ships six runtime dependencies, what each one does, what removing it would cost, and the checks a new one must pass.
---

# Runtime dependencies

Evergreen installs as one npm package, and every package it depends on is code its users install and must trust.
This page records the audit of that set: why each dependency is there, what removing it would cost, and the
checks it passed. It is the written reason the [agent brief](../AGENTS.md#dependencies) asks for before a runtime
dependency can be kept or added.

The audit ran on **2026-11-06** at commit `efc784e5`. It changed no behavior and added no network access to any
scan. On **2026-11-09** the lifecycle data and the code that reads and verifies it moved into
[Ebb](https://github.com/velella-sh/ebb) (`@velella/ebb`), so the three Sigstore packages are now Ebb's dependencies and Evergreen depends on Ebb.

## Result

Six direct dependencies remain. Each one is imported by shipped `src/` code, declares no install script, and has
no reviewed lifecycle rule that would make Evergreen report it as end-of-life, deprecated, or retired. Nothing was
unused, so nothing was removed. Removing any of them would drop a feature users already rely on; the section for
each package says which one.

They resolve to a runtime tree of eleven packages: `@modelcontextprotocol/core`, Ebb's three Sigstore packages, and
`@sigstore/core` are the transitive additions. `npm audit --omit=dev` reports zero advisories, and [SECURITY.md](../SECURITY.md) requires
that to stay true at any severity and any depth.

| Dependency | Range | Installed | License | What it does for Evergreen | Install script |
|---|---|---|---|---|---|
| `@modelcontextprotocol/server` | `^2.3.1` | 2.4.0 | Apache-2.0 | Runs the local MCP server and its stdio transport | none |
| `@velella/ebb` | `^0.1.0-rc.1` | 0.1.0-rc.1 | MIT (data CC BY 4.0) | The lifecycle rules, purl and VERS matching, and signed data updates | none |
| `semver` | `^7.8.5` | 7.8.5 | ISC | Reads and compares semantic versions and npm ranges | none |
| `smol-toml` | `^1.9.1` | 1.9.1 | BSD-3-Clause | Parses TOML manifests and lockfiles | none |
| `yaml` | `^2.9.1` | 2.9.1 | ISC | Parses YAML manifests with exact line numbers | none |
| `zod` | `^4.6.5` | 4.6.7 | MIT | Validates MCP tool input and the capability manifest | none |

## Why each one stays

### `@modelcontextprotocol/server`

The official MCP TypeScript SDK. `src/mcp.ts` registers the ten tools, resources, and the migration prompt on its
`McpServer`, and `src/mcp-server.ts` serves them over stdio for `evergreen-mcp`. The tests drive the same server
through its `InMemoryTransport`, which is why the package is also imported by `tests/`. Writing the JSON-RPC
framing, capability negotiation, and transport by hand would replace maintained protocol code with code no host
has tested, for a server that has to work with Claude, Codex, Copilot, and other MCP hosts.

### `@velella/ebb`

[Ebb](https://github.com/velella-sh/ebb) is the lifecycle data every finding comes from, published as its own package so other tools can use it:
the rules, the purl and VERS matching, the forecast, and the data updates that fetch a newer signed bundle and verify
it with Sigstore before use. Its runtime dependencies are `@sigstore/bundle`, `@sigstore/protobuf-specs`, and
`@sigstore/verify`, which verify a data bundle offline against the trusted root Ebb ships. It is part of the same
organization and reviewed the same way. Without it Evergreen would have no rules to report.

### `semver`

`semver` parses and compares versions and evaluates npm ranges in the npm detector, the version schemes, the lockfile
readers, `doctor`, `guard`, and the upgrade checks. Range syntax is where a small shortcut turns into wrong findings:
`||`, `x` ranges, hyphen ranges, and prerelease precedence all have defined behavior. `src/vers/semver.ts` already
adds the Composer and Go short forms on top; the comparison below that is the package's job.

### `smol-toml`

`smol-toml` parses `pyproject.toml`, `poetry.lock`, `uv.lock`, `pdm.lock`, and other TOML files read by the Python
detector, drift, fix, upgrade, and workspace code. It has no dependencies and no install script. A TOML parser is
not something to hand-roll for a tool whose findings must cite an exact declaration.

### `yaml`

`yaml` parses workflows, Compose files, Kubernetes manifests, Helm values, serverless templates, and the YAML
manifests behind drift. The detectors need node positions, not only values, so the parser has to keep them:
`LineCounter` and the document API are why findings can name an exact file and line. It is also used in the
codemods that edit those files without reformatting them.

### `zod`

`zod` defines the MCP tool input schemas in `src/mcp.ts` and validates the capability manifest in
`src/capabilities/schema.ts`. The MCP SDK already depends on it, so it is installed either way; declaring it
directly is required because Evergreen imports `zod/v4` itself. Replacing it would duplicate the schema definitions
and drift from what the SDK validates.

## What the audit checked

Need: every dependency in `package.json` is imported by at least one file under shipped `src/`, or by a file that
entry points import. `knip` in `npm run check` fails on an unused declaration.

Upkeep: each package is published from an actively maintained upstream (`modelcontextprotocol/typescript-sdk`,
`velella-sh/ebb`, `npm/node-semver`, `squirrelchat/smol-toml`, `eemeli/yaml`,
`colinhacks/zod`). [Dependabot](../.github/dependabot.yml) opens weekly update pull requests with a seven-day
cooldown, and the lockfile pins the resolved version.

Install scripts: none of the six declares `preinstall`, `install`, or `postinstall` at its installed version.
These commands reproduce the audit:

```bash
npm ls --omit=dev --all
npm audit --omit=dev
node -e '
const fs = require("node:fs");
for (const name of Object.keys(require("./package.json").dependencies)) {
  const { scripts = {} } = JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, "utf8"));
  const install = Object.keys(scripts).filter((key) => /^(pre|post)?install$/.test(key));
  console.log(name, install.length ? install.join(",") : "no install scripts");
}'
```

Lifecycle: `evergreen check pkg:npm/<name>@<version>` for each installed version returned `no-data` on
2026-11-06. That means no reviewed rule covers these packages; it does not mean they are safe, and it is not a
substitute for the advisory check above.

## Adding a runtime dependency

A new runtime dependency is a new package every user installs. It needs all of the following in the pull request:

1. A reason that names the feature it serves and why the code in this repository or the standard library cannot
   serve it.
2. No `preinstall`, `install`, or `postinstall` script, unless the pull request explains what the script does and
   why it is required.
3. A license compatible with Apache-2.0.
4. `npm run dev -- check pkg:npm/<name>@<version>` with no end-of-life, deprecated, or retired result. If the check
   names a replacement, use it or ask in the issue.
5. No new advisory in the runtime tree (`npm audit --omit=dev`) at any severity.
6. An entry in the table on this page, with the same fields as the existing rows.

Removing a dependency needs the same care in reverse: check that no shipped entry point imports it, that its
replacement parses the same inputs, and that the findings and their file and line locations do not change.
