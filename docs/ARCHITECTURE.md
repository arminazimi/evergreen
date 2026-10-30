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

The project remains one TypeScript package with explicit module seams. The public detector SDK is exported from `evergreen-deprecation/sdk`; a separate workspace package is unnecessary while the interface and implementation share a release lifecycle.

The detector SDK is the seam between the scan engine and detector adapters. Its interface is deliberately small: an API version, a stable detector ID, and one `scan` operation. Built-in detectors are composed by the CLI and are not imported by the core engine. The engine owns detector attribution, sorting, and output contracts.

The Python detector is the first new ecosystem implemented entirely through this seam. Its manifest and lockfile parsing remains inside the detector adapter; the engine requires no Python-specific behavior.

Source usage analysis is a shared batch module below the detector seam. A detector supplies declarative, language-specific match contracts; the module owns repository traversal, import binding resolution, call matching, configuration matching, deduplication, and impact calculation. This keeps language heuristics out of detector adapters and lets all matched package rules share one repository pass. Findings remain valid when no usages are found, because package metadata establishes the lifecycle risk independently of source usage.

JavaScript, TypeScript, and Python import and call matching use a vendored tree-sitter WebAssembly runtime under `src/usage/vendor/tree-sitter/`, limited to those four grammars. The package does not depend on `@vscode/tree-sitter-wasm` at install time: that package ships many unused grammars, and making it optional would fall back to the regex scanner and change scan results. When the parser cannot run (file too large, over budget, or runtime load failure), the shared module still falls back to the regex scanner for that file.

The GitHub Action is an adapter over a single action-runner module. That module owns scanning, optional baseline comparison, severity-gate evaluation, annotation data, and report persistence behind one interface. The bundled entry point only translates environment inputs and outcomes to GitHub workflow commands; the composite wrapper uploads the already-generated report even when the gate fails.

Migration context is produced by a pure module whose interface accepts a scan result and finding ID. It owns lookup, affected-file derivation, constraints, ordered steps, sources, and verification commands. The CLI and local MCP server reuse the same interface.

The agent-tools module owns the complete scan-to-verification workflow behind a transport-independent interface. It remembers findings observed during one session so verification cannot mistake an arbitrary or unknown ID for a successful migration. Verification performs a fresh scan, compares the stable rule-and-path identity, and returns suggested commands without executing them. The MCP module is a thin stdio adapter over this interface; it contains no detector or migration logic.

The MCP entry point uses the official TypeScript SDK's local stdio transport. It does not expose an HTTP listener, make outbound requests, or call a hosted Evergreen service. Repository analysis and session state stay on the user's machine; only structured tool results travel through the local stdio connection to the agent host.

The portable Agent Skill is a thin instruction adapter over the MCP and CLI interfaces. It owns no lifecycle facts, detector behavior, migration constraints, or permission grants. This keeps the prompt surface vendor-neutral and lets executable contracts remain the single source of truth.

Codex and Claude plugins are generated host adapters over that portable Skill and the same local MCP launch contract. Their manifests may express host-specific discovery and presentation fields, but they cannot own workflow or executable behavior. A deterministic assembly module pins both adapters to the root package version, copies the canonical Skill byte-for-byte, and rejects drift in CI. See the [plugin packaging architecture](PLUGIN_PACKAGING.md) and [Decision 0003](decisions/0003-shared-plugin-packaging.md).

## Trust boundaries

- Repository contents are untrusted input.
- Registry entries are reviewed data, not executable code.
- The MCP server is stdio-only and has no network transport.
- Detectors cannot make network calls through the core contract.
- A finding must identify its detector, rule, evidence source, and affected location.
- AI-generated interpretation may enrich a finding but cannot create a core finding.
- Registry envelopes and every rule are validated before detector logic consumes them.

## Hosting

No backend is required. The CLI and MCP server run locally, the GitHub Action runs on the repository's runner, and the rule registry ships with signed project releases. Documentation is a static GitHub Pages site built from `docs/`; it receives no repository source code.
