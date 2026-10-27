/**
 * Copies the tree-sitter runtime and the four grammars Evergreen loads from an
 * installed `@vscode/tree-sitter-wasm` into `src/usage/vendor/tree-sitter/`.
 *
 * Pin the package version below when refreshing. Install it first, for example:
 * `npm install --no-save @vscode/tree-sitter-wasm@0.3.1`
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_VERSION = "0.3.1";
/** Source name inside `@vscode/tree-sitter-wasm/wasm`, and destination name under the vendor dir. */
const FILES = [
  { from: "tree-sitter.js", to: "tree-sitter.cjs" },
  { from: "tree-sitter.wasm", to: "tree-sitter.wasm" },
  { from: "tree-sitter-javascript.wasm", to: "tree-sitter-javascript.wasm" },
  { from: "tree-sitter-typescript.wasm", to: "tree-sitter-typescript.wasm" },
  { from: "tree-sitter-tsx.wasm", to: "tree-sitter-tsx.wasm" },
  { from: "tree-sitter-python.wasm", to: "tree-sitter-python.wasm" },
] as const;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "src/usage/vendor/tree-sitter");
const require = createRequire(join(root, "package.json"));

let entry: string;
try {
  entry = require.resolve("@vscode/tree-sitter-wasm");
} catch {
  console.error(`Install @vscode/tree-sitter-wasm@${PINNED_VERSION} first (npm install --no-save @vscode/tree-sitter-wasm@${PINNED_VERSION}).`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8")) as { version?: string };
if (packageJson.version !== PINNED_VERSION) {
  console.error(`Expected @vscode/tree-sitter-wasm@${PINNED_VERSION}, found ${packageJson.version ?? "unknown"}.`);
  process.exit(1);
}

const wasmDirectory = dirname(entry);
mkdirSync(destination, { recursive: true });
for (const file of FILES) {
  const from = join(wasmDirectory, file.from);
  if (!existsSync(from)) {
    console.error(`Missing ${file.from} in @vscode/tree-sitter-wasm.`);
    process.exit(1);
  }
  cpSync(from, join(destination, file.to));
}
cpSync(join(wasmDirectory, "web-tree-sitter.d.ts"), join(destination, "tree-sitter.d.ts"));
cpSync(join(dirname(entry), "..", "LICENSE"), join(destination, "LICENSE"));

const readme = readFileSync(join(destination, "README.md"), "utf8").replace(
  /@vscode\/tree-sitter-wasm@[\d.]+/g,
  `@vscode/tree-sitter-wasm@${PINNED_VERSION}`,
);
writeFileSync(join(destination, "README.md"), readme);
console.log(`Synced ${FILES.length} runtime files from @vscode/tree-sitter-wasm@${PINNED_VERSION} into src/usage/vendor/tree-sitter.`);
