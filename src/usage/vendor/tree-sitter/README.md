# Vendored tree-sitter WASM (trimmed)

Runtime and grammar files taken from [`@vscode/tree-sitter-wasm@0.3.1`](https://www.npmjs.com/package/@vscode/tree-sitter-wasm) (MIT). Only the pieces Evergreen loads are kept:

| File | Role |
|---|---|
| `tree-sitter.cjs` / `tree-sitter.wasm` | WebAssembly parser runtime (`.cjs` so it stays CommonJS inside this package) |
| `tree-sitter-javascript.wasm` | JavaScript grammar |
| `tree-sitter-typescript.wasm` | TypeScript grammar |
| `tree-sitter-tsx.wasm` | TSX grammar |
| `tree-sitter-python.wasm` | Python grammar |

Unused grammars from that package (C++, C#, Ruby, …) are not shipped. Making the npm package optional would fall back to the regex scanner and change scan results, so Evergreen vendors this fixed subset instead.

Refresh with `node dist/tools/sync-tree-sitter-wasm.js` after bumping the pinned version in that script (requires a temporary install of `@vscode/tree-sitter-wasm`).
