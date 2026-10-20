import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { declaresInput } from "../src/detector-inputs.js";
import { declaredInputsCheck } from "../src/conformance/checks/inputs.js";
import { traceReads } from "../src/conformance/trace-reads.js";
import { ConformanceError, runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-inputs-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

test("declaresInput matches names, wildcards, extensions, source extensions, and directories", () => {
  const inputs = {
    fileNames: ["package.json", "requirements*.txt", "*.Dockerfile"],
    extensions: [".csproj"],
    sourceExtensions: [".ts"],
    directories: [".github/workflows"],
  };
  for (const path of ["package.json", "a/b/Package.JSON", "requirements.txt", "requirements-dev.txt", "x/api.Dockerfile", "src/App.csproj", "src/index.ts", ".github/workflows/ci.yml", "sub/.github/workflows/x.yml"]) {
    assert.ok(declaresInput(inputs, path), path);
  }
  for (const path of ["package.jsonx", "notes.txt", "src/index.js", ".github/ci.yml", "workflows/ci.yml", "xgithub/workflows/a.yml", "requirements.md"]) {
    assert.ok(!declaresInput(inputs, path), path);
  }
  assert.ok(!declaresInput({}, "package.json"));
});

test("traceReads reports files whose contents are opened, not listings, and ignores files outside the root", async () => {
  const root = await tree({ "a.txt": "a", "dir/b.txt": "b", "c.txt": "c" });
  const outside = await tree({ "x.txt": "x" });
  const reads = await traceReads(root, async () => {
    await readFile(join(root, "a.txt"), "utf8");
    await readFile(join(root, "dir", "b.txt"));
    await readdir(root);
    await readFile(join(outside, "x.txt"));
  });
  assert.deepEqual(reads, ["a.txt", "dir/b.txt"]);
  // Tracing is removed afterwards: later reads are not recorded and still work.
  assert.equal(await readFile(join(root, "c.txt"), "utf8"), "c");
});

function leaky(): Detector {
  return {
    apiVersion: DETECTOR_API_VERSION,
    id: "leaky",
    inputs: { fileNames: ["package.json"] },
    async scan({ root }) {
      await readFile(join(root, "package.json"), "utf8");
      await readFile(join(root, "secrets", "token.txt"), "utf8");
      return [];
    },
  };
}

test("a scan that reads a file outside its declaration fails conformance and names the file", async () => {
  const root = await tree({ "package.json": "{}", "secrets/token.txt": "x" });
  await assert.rejects(
    runDetectorConformance({ detector: leaky(), fixtures: [{ name: "leak", root, expectedFindings: [] }], checks: [declaredInputsCheck] }),
    (error: unknown) =>
      error instanceof ConformanceError &&
      error.guarantee === "declared inputs" &&
      /read "secrets\/token\.txt", which its inputs do not declare/.test(error.message),
  );
});

test("a detector that declares nothing, or only declared files, passes", async () => {
  const root = await tree({ "package.json": "{}" });
  const quiet: Detector = { apiVersion: DETECTOR_API_VERSION, id: "quiet", inputs: { fileNames: ["package.json"] }, async scan({ root: where }) { await readFile(join(where, "package.json")); return []; } };
  const silent: Detector = { apiVersion: DETECTOR_API_VERSION, id: "silent", async scan({ root: where }) { await readFile(join(where, "package.json")); return []; } };
  for (const detector of [quiet, silent]) {
    await runDetectorConformance({ detector, fixtures: [{ name: "f", root, expectedFindings: [] }], checks: [declaredInputsCheck] });
  }
});

async function scanRoots(): Promise<string[]> {
  const roots = [resolve("examples/demo")];
  for (const entry of await readdir("tests/fixtures", { withFileTypes: true })) {
    if (entry.isDirectory()) roots.push(resolve("tests/fixtures", entry.name));
  }
  return roots;
}

test("every built-in detector declares its inputs", () => {
  for (const detector of builtInDetectors) {
    const inputs = detector.inputs;
    assert.ok(inputs, `${detector.id} declares no inputs`);
    const total = (inputs.fileNames?.length ?? 0) + (inputs.extensions?.length ?? 0) + (inputs.directories?.length ?? 0) + (inputs.sourceExtensions?.length ?? 0);
    assert.ok(total > 0, `${detector.id} declares empty inputs`);
  }
});

test("no built-in detector reads a file outside its declaration on the repository fixtures", async () => {
  const roots = await scanRoots();
  assert.ok(roots.length > 10);
  for (const detector of builtInDetectors) {
    for (const root of roots) {
      await declaredInputsCheck.run({ detector, fixture: { name: root, root, expectedFindings: [] } });
    }
  }
});

test("a tree holding every declared name and unrelated files is read only where declared", async () => {
  const noise = { "README.md": "# readme", "notes.txt": "x", "secret.pem": "key", "docs/guide.md": "guide", "data/blob.bin": "bin" };
  for (const detector of builtInDetectors) {
    const inputs = detector.inputs!;
    const files: Record<string, string> = { ...noise };
    for (const name of inputs.fileNames ?? []) files[`${name.replaceAll("*", "x")}`] = "";
    for (const extension of inputs.extensions ?? []) files[`project/App${extension}`] = "";
    for (const extension of inputs.sourceExtensions ?? []) files[`src/main${extension}`] = "";
    for (const directory of inputs.directories ?? []) files[`${directory}/config.yml`] = "";
    const root = await tree(files);
    await declaredInputsCheck.run({ detector, fixture: { name: detector.id, root, expectedFindings: [] } });
    const reads = await traceReads(root, () => detector.scan({ root }));
    for (const path of Object.keys(noise)) assert.ok(!reads.includes(path), `${detector.id} read ${path}`);
  }
});
