import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Nested dependency manifests that scanners treat as part of this package. */
const NESTED_MANIFEST =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Bun\.lock|Bun\.lockb|requirements[^/]*\.txt|go\.mod|pom\.xml)$/i;

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
});
