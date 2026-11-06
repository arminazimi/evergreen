# Architecture

## Shape

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" role="img" aria-labelledby="arch-title arch-desc" style="max-width:100%;height:auto">
  <title id="arch-title">Evergreen architecture</title>
  <desc id="arch-desc">Adapters for CLI, GitHub Action, and MCP feed one scan engine that combines detectors and the registry into findings rendered as text, JSON, or annotations.</desc>
  <rect width="720" height="420" fill="#F7F7F5"/>
  <rect x="40" y="28" width="200" height="56" rx="10" fill="#17211E"/>
  <text x="140" y="62" text-anchor="middle" fill="#F3F6F4" font-family="system-ui,sans-serif" font-size="15" font-weight="600">CLI</text>
  <rect x="260" y="28" width="200" height="56" rx="10" fill="#17211E"/>
  <text x="360" y="62" text-anchor="middle" fill="#F3F6F4" font-family="system-ui,sans-serif" font-size="15" font-weight="600">GitHub Action</text>
  <rect x="480" y="28" width="200" height="56" rx="10" fill="#17211E"/>
  <text x="580" y="62" text-anchor="middle" fill="#F3F6F4" font-family="system-ui,sans-serif" font-size="15" font-weight="600">MCP server</text>
  <path d="M140 84V112M360 84V112M580 84V112M140 112H580" stroke="#4C7C6D" stroke-width="2" fill="none"/>
  <path d="M360 112V140" stroke="#4C7C6D" stroke-width="2"/>
  <rect x="220" y="140" width="280" height="64" rx="12" fill="#23423A"/>
  <text x="360" y="178" text-anchor="middle" fill="#F3F6F4" font-family="system-ui,sans-serif" font-size="18" font-weight="700">Scan engine</text>
  <path d="M280 204V232M440 204V232" stroke="#4C7C6D" stroke-width="2"/>
  <rect x="120" y="232" width="200" height="56" rx="10" fill="#FFFFFF" stroke="#4C7C6D" stroke-width="2"/>
  <text x="220" y="266" text-anchor="middle" fill="#17211E" font-family="system-ui,sans-serif" font-size="15" font-weight="600">Detectors</text>
  <rect x="400" y="232" width="200" height="56" rx="10" fill="#FFFFFF" stroke="#4C7C6D" stroke-width="2"/>
  <text x="500" y="266" text-anchor="middle" fill="#17211E" font-family="system-ui,sans-serif" font-size="15" font-weight="600">Registry</text>
  <path d="M220 288V316M500 288V316M220 316H500" stroke="#4C7C6D" stroke-width="2" fill="none"/>
  <path d="M360 316V344" stroke="#4C7C6D" stroke-width="2"/>
  <rect x="250" y="344" width="220" height="48" rx="10" fill="#9AC7B6"/>
  <text x="360" y="374" text-anchor="middle" fill="#0C1110" font-family="system-ui,sans-serif" font-size="15" font-weight="700">Findings</text>
  <text x="360" y="408" text-anchor="middle" fill="#5C5C57" font-family="system-ui,sans-serif" font-size="13">Text · JSON · annotations · SARIF · HTML</text>
</svg>

Evergreen is one TypeScript package with seven layers. A module belongs to exactly one layer and may import only the layers the table allows. [Decision 0031](decisions/0031-layered-architecture-and-allowed-imports.md) is the source of truth for the full allowed-imports matrix; this page explains the shape and where each piece lives. `npm run check:architecture` (`tools/check-architecture.ts`) enforces the rules that exist today and baselines known violations in `tools/architecture-baseline.json`, which may only shrink.

A separate workspace package per layer is unnecessary while the interface and implementation share one release lifecycle. The public detector SDK is exported from `evergreen-deprecation/sdk`.

## Layers

| Layer | Lives in | Owns |
|---|---|---|
| Domain | [domain.ts](../src/domain.ts), [errors.ts](../src/errors.ts), [purl.ts](../src/purl.ts), [paths.ts](../src/paths.ts), [vers/](../src/vers) | Types, output contracts, pure helpers |
| Detector SDK | [sdk.ts](../src/sdk.ts) | API version, stable detector ID, one `scan` operation |
| Core | [engine.ts](../src/engine.ts), [source-usage.ts](../src/source-usage.ts), [usage/](../src/usage), [registry.ts](../src/registry.ts), [scan-cache.ts](../src/scan-cache.ts), [detector-inputs.ts](../src/detector-inputs.ts) | Detector attribution, sorting, repository traversal, usage matching, rule loading |
| Detectors | [detectors/](../src/detectors) | Reading manifests and lockfiles for one ecosystem |
| Services | [plan.ts](../src/plan.ts), [migration-packet.ts](../src/migration-packet.ts), [fix/](../src/fix), [sbom/](../src/sbom), [drift/](../src/drift), [export/](../src/export), [inventory/](../src/inventory), [baseline.ts](../src/baseline.ts), [diff.ts](../src/diff.ts), [forecast.ts](../src/forecast.ts), [receipt.ts](../src/receipt.ts), [agent-tools.ts](../src/agent-tools.ts) | Analysis built on a scan result. No argument parsing, no host protocol |
| Reporters | [reporters.ts](../src/reporters.ts), [reporters/](../src/reporters), [mermaid.ts](../src/mermaid.ts) | Text, JSON, SARIF, HTML, and other formats |
| Adapters | [cli.ts](../src/cli.ts), [commands/](../src/commands), [mcp.ts](../src/mcp.ts), [lsp.ts](../src/lsp.ts), [action.ts](../src/action.ts), [github-action.ts](../src/github-action.ts), [tui.ts](../src/tui.ts) | Translating one host interface to services and reporters |

Registry data under `registry/` is data, not a layer. Only the core loads it.

Rules that follow from the table:

- The core never imports detectors. Built-in detectors reach the engine only through [scan-builtins.ts](../src/scan-builtins.ts), which an adapter or service calls.
- Detectors may use the shared usage matcher but may not import services, reporters, or adapters.
- Nothing imports an adapter except another adapter. Logic an adapter shares belongs in a service.
- Domain, SDK, and core are meant to do no file or network access; that rule lands with the pure-core work. Detectors and reporters never use the network.

## How the pieces work

The detector SDK is the seam between the scan engine and detectors. Its interface is deliberately small. The engine owns detector attribution, sorting, and output contracts. See [DETECTORS.md](DETECTORS.md) for the contract.

Source usage analysis is a shared batch module below the detector seam. A detector supplies declarative, language-specific match contracts; the module owns repository traversal, import binding resolution, call matching, configuration matching, deduplication, and impact calculation, and all matched package rules share one repository pass. Findings remain valid when no usages are found, because package metadata establishes the lifecycle risk independently of source usage.

JavaScript, TypeScript, and Python import and call matching use a vendored tree-sitter WebAssembly runtime under `src/usage/vendor/tree-sitter/`, limited to those four grammars. The WebAssembly modules are committed as base64 text with a manifest of their upstream source and SHA-256 hashes, and the loader decodes them in memory, so the repository carries no binary artifact. The package does not depend on `@vscode/tree-sitter-wasm` at install time: that package ships many unused grammars, and making it optional would fall back to the regex scanner and change scan results. When the parser cannot run (file too large, over budget, or runtime load failure), the shared module falls back to the regex scanner for that file.

The GitHub Action is an adapter over a single action-runner module. That module owns scanning, optional baseline comparison, severity-gate evaluation, annotation data, and report persistence behind one interface. The bundled entry point only translates environment inputs and outcomes to GitHub workflow commands; the composite wrapper uploads the already-generated report even when the gate fails.

Migration context is produced by a pure module whose interface accepts a scan result and finding ID. It owns lookup, affected-file derivation, constraints, ordered steps, sources, and verification commands. The CLI and local MCP server reuse the same interface.

The agent-tools module owns the complete scan-to-verification workflow behind a transport-independent interface. It remembers findings observed during one session so verification cannot mistake an arbitrary or unknown ID for a successful migration. Verification performs a fresh scan, compares the stable rule-and-path identity, and returns suggested commands without executing them. The MCP module is a thin adapter over this interface and contains no detector or migration logic. See [MCP.md](MCP.md).

The local MCP entry point uses the official TypeScript SDK's stdio transport. It does not expose an HTTP listener, make outbound requests, or call a hosted Evergreen service. Repository analysis and session state stay on the user's machine.

The portable Agent Skill is a thin instruction adapter over the MCP and CLI interfaces. It owns no lifecycle facts, detector behavior, migration constraints, or permission grants. Codex and Claude plugins are generated host adapters over that Skill and the same local MCP launch contract; a deterministic assembly module pins both to the root package version and rejects drift in CI. See the [plugin packaging architecture](PLUGIN_PACKAGING.md) and [Decision 0003](decisions/0003-shared-plugin-packaging.md).

## Trust boundaries

- Repository contents are untrusted input.
- Registry entries are reviewed data, not executable code.
- The MCP server is stdio-only and has no network transport.
- Detectors cannot make network calls through the core contract.
- A finding must identify its detector, rule, evidence source, and affected location.
- AI-generated interpretation may enrich a finding but cannot create a core finding.
- Registry envelopes and every rule are validated before detector logic consumes them.

## Hosting

No backend is required. The CLI and MCP server run locally, the GitHub Action runs on the repository's runner, and the rule registry ships with signed project releases. Documentation is a static GitHub Pages site: a workflow builds `docs/` with Jekyll and deploys the `_site` artifact ([pages.yml](../.github/workflows/pages.yml)); it receives no repository source code.
