import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { preparePackageSmoke } from "../tools/prepare-package-smoke.js";

const execute = promisify(execFile);

test("the locked tarball installs offline and a changed tarball fails integrity verification", async () => {
  // npm 11 rejects a --prefix reached through a symlink (macOS /var -> /private/var), so resolve it first.
  const root = await mkdtemp(join(await realpath(tmpdir()), "evergreen-packed~smoke-"));
  const npm = (args: string[]) =>
    execute(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd: root,
      shell: process.platform === "win32",
      timeout: 30_000,
      env: { ...process.env, npm_config_cache: join(root, "cache-pack") },
    });
  try {
    const manifest = { name: "smoke-fixture", version: "1.0.0", files: ["README.md"] };
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({ ...manifest, lockfileVersion: 3, packages: { "": manifest } }),
    );
    await writeFile(join(root, "README.md"), "original artifact");
    const pack = () => npm(["pack", "--ignore-scripts", "--json"]);
    await pack();
    const tarball = join(root, "smoke-fixture-1.0.0.tgz");
    const directory = join(root, "install");
    await preparePackageSmoke(tarball, directory, root);
    const install = (cache: string) =>
      npm([
        "ci",
        "--prefix",
        directory,
        "--offline",
        "--ignore-scripts",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        "--cache",
        join(root, cache),
      ]);
    await install("cache-original");
    assert.equal(await readFile(join(directory, "node_modules/smoke-fixture/README.md"), "utf8"), "original artifact");
    await writeFile(join(root, "README.md"), "altered artifact");
    await pack();
    await assert.rejects(install("cache-altered"), /EINTEGRITY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
