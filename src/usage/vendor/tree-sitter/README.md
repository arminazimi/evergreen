# Vendored tree-sitter WASM (trimmed)

Runtime and grammars taken from [`@vscode/tree-sitter-wasm@0.3.1`](https://www.npmjs.com/package/@vscode/tree-sitter-wasm) (MIT). Only the pieces Evergreen loads are kept:

| File | Role |
|---|---|
| `tree-sitter.cjs` | WebAssembly parser runtime (`.cjs` so it stays CommonJS inside this package) |
| `tree-sitter.d.ts` | Typings for that runtime |
| `tree-sitter.wasm.b64` | Runtime WebAssembly module |
| `tree-sitter-javascript.wasm.b64` | JavaScript grammar |
| `tree-sitter-typescript.wasm.b64` | TypeScript grammar |
| `tree-sitter-tsx.wasm.b64` | TSX grammar |
| `tree-sitter-python.wasm.b64` | Python grammar |
| `manifest.json` | Upstream package, tarball URL, and decoded SHA-256 and size of every payload |

Unused grammars from that package (C++, C#, Ruby, …) are not shipped. Making the npm package optional would fall back to the regex scanner and change scan results, so Evergreen vendors this fixed subset instead.

## Why the payloads are text

The WebAssembly modules are committed as base64 text, not as `.wasm` binaries, so the repository contains no binary artifacts (OpenSSF Scorecard's Binary-Artifacts check) and every vendored byte is reviewable in a diff. `src/usage/tree-sitter.ts` decodes each payload in memory and hands the bytes to the runtime; scans never read a `.wasm` file and never use the network.

`manifest.json` is the record of where each payload came from:

- package: `@vscode/tree-sitter-wasm@0.3.1`, MIT
- tarball: the `source` field in `manifest.json`
- one `sha256` and byte count per decoded payload, plus its upstream path

## Refresh

```bash
npm install --no-save --package-lock=false @vscode/tree-sitter-wasm@0.3.1
npm run build
node dist/tools/sync-tree-sitter-wasm.js
node dist/tools/verify-tree-sitter-wasm.js
```

`tools/sync-tree-sitter-wasm.ts` pins the version. It verifies the installed bytes against the committed manifest when the version is unchanged, writes the base64 payloads and manifest, and removes the binary form a previous sync may have left behind. Bumping the pin means changing `PINNED_VERSION` in the script, running it, and reviewing the new hashes it records in `manifest.json` in the same pull request.

`tools/verify-tree-sitter-wasm.ts` decodes every committed payload, checks its size and SHA-256 against `manifest.json`, and reports stray `.wasm` files. It is offline and runs in the test suite; run it directly with `node dist/tools/verify-tree-sitter-wasm.js`.

## Local patch to the runtime

`tree-sitter.cjs` is copied from upstream except for one line: `addEmJs` strips every `*` from
an EM_JS parameter type instead of only the first, so a `char **` argument produces a valid
helper. `tools/sync-tree-sitter-wasm.ts` applies that patch while syncing and fails if the
upstream line it replaces moves, so a refresh cannot silently drop it.
