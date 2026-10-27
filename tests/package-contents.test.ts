import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Nested dependency manifests that scanners treat as part of this package. */
const NESTED_MANIFEST =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Bun\.lock|Bun\.lockb|requirements[^/]*\.txt|go\.mod|pom\.xml)$/i;

const TREE_SITTER_VENDOR_FILES = new Set([
  "LICENSE",
  "README.md",
  "tree-sitter.d.ts",
  "tree-sitter.cjs",
  "tree-sitter.wasm",
  "tree-sitter-javascript.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-tsx.wasm",
  "tree-sitter-typescript.wasm",
]);

test("the npm tarball ships only the root package.json as a dependency manifest", async () => {
  // Ignore scripts: prepack runs `npm run check`, which would recurse into this test.
  // npm.cmd needs the platform shell on Windows (same pattern as src/guard.ts).
  const { stdout } = await execute("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  const packed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }> | { files: Array<{ path: string }> };
  const files = (Array.isArray(packed) ? packed[0]?.files : packed.files) ?? [];
  const nested = files.map((file) => file.path).filter((path) => path !== "package.json" && NESTED_MANIFEST.test(path));
  assert.deepEqual(nested, [], "fixture and example manifests must stay out of the published tarball");

  const paths = files.map((file) => file.path);
  assert.ok(
    paths.some((path) => path.endsWith("usage/vendor/tree-sitter/tree-sitter-python.wasm")),
    "trimmed tree-sitter grammars must ship in the tarball",
  );
  assert.equal(
    paths.some((path) => path.includes("tree-sitter-cpp.wasm") || path.includes("tree-sitter-ruby.wasm")),
    false,
    "unused tree-sitter grammars must stay out of the tarball",
  );
  assert.equal(
    paths.some((path) => path.endsWith(".map")),
    false,
    "source maps are not needed at runtime and must stay out of the tarball",
  );
  assert.equal(
    paths.some((path) => path.includes("skills/") && path.includes("/evals/")),
    false,
    "skill eval fixtures are not needed at runtime and must stay out of the tarball",
  );
});

test("runtime dependencies omit @vscode/tree-sitter-wasm and vendor only the grammars in use", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    dependencies: Record<string, string>;
  };
  assert.equal(
    Object.hasOwn(packageJson.dependencies, "@vscode/tree-sitter-wasm"),
    false,
    "the fat grammar pack must not be a runtime dependency",
  );
  const vendor = await readdir("src/usage/vendor/tree-sitter");
  assert.deepEqual(new Set(vendor), TREE_SITTER_VENDOR_FILES);
});
