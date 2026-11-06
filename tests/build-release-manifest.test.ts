import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { verifyReleaseManifest } from "../src/release-manifest.js";
import { packedFiles, writeReleaseManifestFromPackList } from "../tools/build-release-manifest.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function tinyPackage(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-packlist-"));
  roots.push(root);
  const files = {
    "package.json": `${JSON.stringify({ name: "evergreen-deprecation", version: "9.9.9", files: ["lib"] })}\n`,
    "README.md": "# tiny\n",
    "lib/index.js": "export const value = 1;\n",
    "src/not-shipped.ts": "export const value = 1;\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, ...path.split("/"));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents);
  }
  return root;
}

test("the manifest lists exactly what npm would pack, and a changed packed file fails verification", async () => {
  const root = await tinyPackage();
  const listed = await packedFiles(root);
  assert.deepEqual(listed, ["README.md", "lib/index.js", "package.json"]);
  assert.equal(listed.includes("src/not-shipped.ts"), false);

  const target = await writeReleaseManifestFromPackList(root);
  assert.match(await readFile(target, "utf8"), /"path": "lib\/index\.js"/);
  assert.equal((await verifyReleaseManifest(root))?.problems.length, 0);

  await writeFile(join(root, "lib", "index.js"), "export const value = 2;\n");
  assert.match((await verifyReleaseManifest(root))?.problems.join("\n") ?? "", /lib\/index\.js does not match/);
});
