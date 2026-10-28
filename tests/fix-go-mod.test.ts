import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

async function repository(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-go-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function fix(root: string): Promise<string> {
  return (await execute(process.execPath, [cli, "fix", root, "--dry-run"])).stdout;
}

test("raises only Go directive values, preserves formatting, and produces an applicable, idempotent patch", async (t) => {
  const before = "module example.com/app\n\ngo\t1.24.3 // floor\n\nrequire example.com/dep v1.0.0 // indirect\n\ntoolchain go1.25.1 // builder\n";
  const root = await repository(t, {
    "go.mod": before,
    "go.sum": "unchanged\n",
    "vendor/modules.txt": "# example.com/dep v1.0.0\n## explicit; go 1.26\nexample.com/dep\n",
  });
  const patch = await fix(root);
  assert.match(patch, /\+go\t1\.26\.0 \/\/ floor/);
  assert.match(patch, /\+toolchain go1\.26\.0 \/\/ builder/);
  assert.doesNotMatch(patch, /^[+-](?:module|require)/m);
  assert.equal(await readFile(join(root, "go.mod"), "utf8"), before);
  await writeFile(join(root, "fix.patch"), patch);
  await execute("git", ["apply", "--check", "fix.patch"], { cwd: root });
  await execute("git", ["apply", "fix.patch"], { cwd: root });
  assert.equal(await readFile(join(root, "go.mod"), "utf8"), before.replace("1.24.3", "1.26.0").replace("go1.25.1", "go1.26.0"));
  assert.equal(await readFile(join(root, "go.sum"), "utf8"), "unchanged\n");
  assert.equal(await fix(root), "");
});

test("fixes nested modules and leaves a newer toolchain and go.work unchanged", async (t) => {
  const root = await repository(t, {
    "nested/go.mod": "module example.com/app\ngo 1.23\ntoolchain go1.27.1\n",
    "go.work": "go 1.24\nuse ./nested\n",
  });
  const patch = await fix(root);
  assert.match(patch, /\+go 1\.26\.0/);
  assert.doesNotMatch(patch, /^[+-]toolchain|a\/go.work/m);
});

for (const [name, contents, vendor] of [
  ["higher dependency floor", "require example.com/dep v1.0.0", "# example.com/dep v1.0.0\n## explicit; go 1.27\n"],
  ["higher patch floor", "require example.com/dep v1.0.0", "# example.com/dep v1.0.0\n## explicit; go 1.26.1\n"],
  ["higher indirect dependency floor", "require example.com/dep v1.0.0 // indirect", "# example.com/dep v1.0.0\n## explicit; go 1.27\n"],
  ["higher transitive floor", "require example.com/dep v1.0.0", "# example.com/dep v1.0.0\n## explicit; go 1.24\n# example.com/transitive v1.0.0\n## go 1.27\n"],
  ["missing dependency metadata", "require example.com/dep v1.0.0", undefined],
  ["stale vendored version", "require example.com/dep v1.0.0", "# example.com/dep v0.9.0\n## explicit; go 1.24\n"],
  ["missing vendored Go floor", "require example.com/dep v1.0.0", "# example.com/dep v1.0.0\n## explicit\n"],
  ["local replacement", "require example.com/dep v1.0.0\nreplace example.com/dep => ./dep", undefined],
  ["malformed require block", "require (\nexample.com/dep v1.0.0", undefined],
] as const) {
  test(`refuses a patch with ${name}`, async (t) => {
    const root = await repository(t, {
      "go.mod": `module example.com/app\ngo 1.24\ntoolchain go1.24.1\n${contents}\n`,
      ...(vendor === undefined ? {} : { "vendor/modules.txt": vendor }),
    });
    assert.equal(await fix(root), "");
  });
}

for (const contents of [
  "module example.com/app\ngo 1.26\n",
  "module example.com/app\ngo 1.24", // renderDiff requires a trailing newline.
  "module example.com/app\ngo 1.24\ngo 1.23\n",
  "module example.com/app\ngo 1.24\ntoolchain go1.25rc1\n",
]) {
  test(`leaves unsupported or already supported declarations alone: ${JSON.stringify(contents)}`, async (t) => {
    assert.equal(await fix(await repository(t, { "go.mod": contents })), "");
  });
}

test("preserves CRLF directive lines", async (t) => {
  const root = await repository(t, { "go.mod": "module example.com/app\r\ngo 1.24\r\n" });
  assert.match(await fix(root), /\+go 1\.26\.0\r\n/);
});

test("refuses vendored metadata symlinked outside the repository", async (t) => {
  const external = await repository(t, { "modules.txt": "# example.com/dep v1.0.0\n## explicit; go 1.24\n" });
  const root = await repository(t, { "go.mod": "module example.com/app\ngo 1.24\nrequire example.com/dep v1.0.0\n" });
  await mkdir(join(root, "vendor"));
  await symlink(join(external, "modules.txt"), join(root, "vendor/modules.txt"));
  assert.equal(await fix(root), "");
});
