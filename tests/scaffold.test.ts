import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { validateRegistryV2 } from "../src/registry.js";
import { renderScaffold, renderScaffoldResult, scaffoldDetector, scaffoldNames, ScaffoldError } from "../tools/scaffold/index.js";
import { compile, removeAll, runTest, scaffoldCheckout } from "./scaffold-helpers.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(() => removeAll(roots));

const exists = (path: string) => access(path).then(() => true, () => false);

test("names are derived from the id", () => {
  assert.deepEqual(scaffoldNames("go-modules"), { id: "go-modules", ecosystem: "go-modules", camel: "goModules", title: "Go modules" });
  assert.deepEqual(scaffoldNames("rust-crates", "cargo"), { id: "rust-crates", ecosystem: "cargo", camel: "rustCrates", title: "Rust crates" });
  assert.deepEqual(scaffoldNames("go"), { id: "go", ecosystem: "go", camel: "go", title: "Go" });
  assert.equal(scaffoldNames("k8s-api").camel, "k8sApi");
});

test("ids that the SDK would reject, or that could escape the repository, are refused", () => {
  for (const bad of ["", "Go", "go_modules", "1go", "go--modules", "-go", "go-", "go modules", "../evil", "go/modules", "go.mod", "GO-MODULES"]) {
    assert.throws(() => scaffoldNames(bad), (error: unknown) => error instanceof ScaffoldError && /not a valid detector id/.test(error.message), JSON.stringify(bad));
  }
  assert.throws(() => scaffoldNames("go", "Go"), /not a valid ecosystem slug/);
  assert.throws(() => scaffoldNames("go", "../x"), /not a valid ecosystem slug/);
});

test("the skeleton is seven files at predictable paths, and its registry is a valid empty v2 registry", () => {
  const names = scaffoldNames("go-modules", "go");
  const files = renderScaffold(names);
  assert.deepEqual([...files.keys()], [
    "src/detectors/go-modules.ts",
    "registry/go-modules.json",
    "tests/go-modules-detector.test.ts",
    "tests/fixtures/go-modules/README.md",
    "tests/fixtures/go-modules/zero/README.md",
    "tests/fixtures/go-modules/malformed/README.md",
    "docs/detectors/go-modules.md",
  ]);
  const registry = validateRegistryV2(JSON.parse(files.get("registry/go-modules.json")!));
  assert.deepEqual([registry.ecosystem, registry.rules.length], ["go", 0]);

  const detector = files.get("src/detectors/go-modules.ts")!;
  assert.match(detector, /import \{ defineDetector, DETECTOR_API_VERSION \} from "\.\.\/sdk\.js";/);
  assert.match(detector, /export const goModulesDetector = defineDetector\(\{/);
  assert.match(detector, /id: "go-modules",/);
  assert.doesNotMatch(detector, /from "\.\.\/(?!sdk\.js)/, "a detector uses the public SDK only");
  assert.match(files.get("tests/go-modules-detector.test.ts")!, /import \{ goModulesDetector \} from "\.\.\/src\/detectors\/go-modules\.js";/);
  assert.match(files.get("docs/detectors/go-modules.md")!, /^# Go modules detector/);
  for (const contents of files.values()) assert.ok(!contents.includes("{{") && !contents.includes("undefined"), "no unrendered placeholder");
});

test("it refuses to run outside a checkout of the repository", async () => {
  const empty = await mkdtemp(join(tmpdir(), "evergreen-not-a-checkout-"));
  roots.push(empty);
  await assert.rejects(scaffoldDetector("sample", { root: empty }), /checkout of the Evergreen repository/);
  await writeFile(join(empty, "package.json"), JSON.stringify({ name: "someone-else" }));
  await assert.rejects(scaffoldDetector("sample", { root: empty }), /checkout of the Evergreen repository/);
  assert.equal(await exists(join(empty, "src")), false, "nothing was created");
});

test("an existing file stops the whole run before anything is written", async () => {
  const checkout = await scaffoldCheckout(roots);
  await mkdir(join(checkout, "docs", "detectors"), { recursive: true });
  await writeFile(join(checkout, "docs", "detectors", "sample.md"), "mine\n");
  await assert.rejects(scaffoldDetector("sample", { root: checkout }), /Nothing was written: docs\/detectors\/sample\.md already exists/);
  assert.equal(await readFile(join(checkout, "docs", "detectors", "sample.md"), "utf8"), "mine\n");
  for (const path of ["src/detectors/sample.ts", "registry/sample.json", "tests/sample-detector.test.ts", "tests/fixtures/sample"]) {
    assert.equal(await exists(join(checkout, path)), false, path);
  }
});

test("a generated skeleton compiles and passes the conformance suite with zero rules", async () => {
  const checkout = await scaffoldCheckout(roots);
  const result = await scaffoldDetector("sample-lang", { root: checkout, ecosystem: "sample" });
  assert.equal(result.files.length, 7);
  for (const file of result.files) assert.ok(await exists(join(checkout, file)), file);

  const compiled = await compile(checkout);
  assert.equal(compiled.ok, true, compiled.output);
  const tested = await runTest(checkout, "dist/tests/sample-lang-detector.test.js");
  assert.equal(tested.ok, true, tested.output);
  assert.match(tested.output, /sample-lang passes detector conformance/);
  assert.match(tested.output, /(?:# |ℹ )pass 1/);
});

test("the result lists the files and the manual steps that remain", async () => {
  const checkout = await scaffoldCheckout(roots);
  const text = renderScaffoldResult(await scaffoldDetector("sample-lang", { root: checkout, ecosystem: "sample" }));
  assert.match(text, /^Created the Sample lang detector skeleton:/);
  assert.match(text, /  src\/detectors\/sample-lang\.ts/);
  assert.match(text, /1\. Register the detector: .*sampleLangDetector.*builtInDetectors/);
  assert.match(text, /BUNDLED_ECOSYSTEMS in src\/data-bundle\.ts/);
  assert.match(text, /npm run check/);
});

test("the command creates the skeleton from a checkout, and explains itself elsewhere", async () => {
  const cli = resolve("dist/src/cli.js");
  const run = (args: string[], cwd: string) => execute(process.execPath, [cli, ...args], { cwd }).then((value) => ({ code: 0, ...value }), (error: { code: number; stdout: string; stderr: string }) => error);

  const checkout = await scaffoldCheckout(roots);
  const created = await run(["new-detector", "tiny-lang"], checkout);
  assert.equal(created.code, 0, created.stderr);
  assert.match(created.stdout, /Created the Tiny lang detector skeleton/);
  assert.equal(await exists(join(checkout, "src", "detectors", "tiny-lang.ts")), true);

  const again = await run(["new-detector", "tiny-lang"], checkout);
  assert.equal(again.code, 2);
  assert.match(again.stderr, /Nothing was written/);

  const outside = await mkdtemp(join(tmpdir(), "evergreen-outside-"));
  roots.push(outside);
  assert.match((await run(["new-detector", "tiny-lang"], outside)).stderr, /checkout of the Evergreen repository/);

  for (const args of [["new-detector"], ["new-detector", "Bad_Id"], ["new-detector", "ok", "--ecosystem"], ["new-detector", "ok", "--ecosystem", "--json"]]) {
    const failure = await run(args, checkout);
    assert.equal(failure.code, 2, args.join(" "));
    assert.notEqual(failure.stderr, "", args.join(" "));
  }
  assert.match((await run(["new-detector"], checkout)).stderr, /Usage: evergreen new-detector <id>/);
});
