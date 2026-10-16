import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, afterEach, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import { EvergreenAgentTools } from "../src/agent-tools.js";
import { checkDependency } from "../src/check-dependency.js";
import { buildDataBundle, serializeDataBundle } from "../src/data-bundle.js";
import { BUNDLE_FILE, cachedBundleDirectory, configureActiveData, SIGNATURE_FILE } from "../src/data-source.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { renderCheckText, renderSarif, renderText } from "../src/reporters.js";

const execute = promisify(execFile);
const roots: string[] = [];
const accepting = { verifySignature: () => ({ identity: "id", issuer: "issuer" }) };

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
afterEach(() => configureActiveData());

const scratch = async (name: string) => {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-${name}-`));
  roots.push(directory);
  return directory;
};

async function project(): Promise<string> {
  const directory = await scratch("project");
  await mkdir(join(directory, ".github", "workflows"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "demo", dependencies: { request: "^2.88.2" } }));
  await writeFile(join(directory, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
  return directory;
}

/** A cache with one old, "verified" bundle, pinned so that it is used whatever its age. */
async function pinOldData(createdAt: string): Promise<string> {
  const root = await scratch("registry");
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const bundle = await buildDataBundle({ root, createdAt, minimumEvergreenVersion: "0.1.0" });
  const cache = await scratch("cache");
  const directory = cachedBundleDirectory(cache, bundle.manifest.version);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, BUNDLE_FILE), serializeDataBundle(bundle));
  await writeFile(join(directory, SIGNATURE_FILE), "{}");
  configureActiveData({ cacheDirectory: cache, pinnedVersion: bundle.manifest.version, ...accepting });
  return bundle.manifest.version;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
const validateScan = ajv.getSchema("https://github.com/arminazimi/evergreen/schemas/scan.v1.schema.json")!;

test("a scan says which data it used and how old it is, in JSON and text", async () => {
  const result = await scanRepository(await project(), builtInDetectors);
  assert.equal(validateScan(JSON.parse(JSON.stringify(result))), true, JSON.stringify(validateScan.errors));
  assert.deepEqual(Object.keys(result.data!).sort(), ["ageDays", "createdAt", "reviewedThrough", "source", "stale", "version"]);
  assert.equal(result.data!.source, "bundled");
  assert.equal(result.data!.stale, false);
  assert.ok(Number.isInteger(result.data!.ageDays));
  assert.match(renderText(result), /^Data: bundled .+, evidence reviewed through \d{4}-\d{2}-\d{2} \(.+\)$/m);
  assert.doesNotMatch(renderText(result), /stale/);
  assert.deepEqual(result.diagnostics, []);
});

test("data older than 30 days is flagged everywhere a result is shown", async () => {
  const version = await pinOldData("2020-01-01T00:00:00Z");
  const root = await project();
  const result = await scanRepository(root, builtInDetectors);
  assert.deepEqual([result.data!.source, result.data!.version, result.data!.stale], ["pinned", version, true]);
  assert.ok(result.data!.ageDays > 365);
  assert.equal(validateScan(JSON.parse(JSON.stringify(result))), true, JSON.stringify(validateScan.errors));

  const warning = `The lifecycle data is ${result.data!.ageDays} days old (stale after 30). Findings may be missing recent changes; run "evergreen data update".`;
  assert.deepEqual(result.diagnostics, [warning], "JSON consumers see the warning in diagnostics");
  const text = renderText(result);
  assert.match(text, /Data: pinned .+, stale$/m);
  assert.ok(text.includes(`Note: ${warning}`));

  const check = await checkDependency("pkg:npm/request@2.88.2");
  assert.equal(check.data!.stale, true);
  assert.match(renderCheckText(check), /Data: pinned .+, stale\n/);
  assert.match(renderCheckText(check), /Warning: The lifecycle data is \d+ days old \(stale after 30\), so this answer may miss recent changes\. Run "evergreen data update"\./);

  const list = await new EvergreenAgentTools().list(root);
  assert.deepEqual(list.data, result.data);
});

test("fresh data produces no warning on any surface", async () => {
  const check = await checkDependency("pkg:npm/request@2.88.2");
  assert.equal(check.data!.stale, false);
  assert.doesNotMatch(renderCheckText(check), /Warning|stale/);
  assert.match(renderCheckText(check), /^Data: bundled /m);
});

test("SARIF records which data was used without anything that changes with the calendar", async () => {
  const result = await scanRepository(await project(), builtInDetectors);
  const sarif = JSON.parse(renderSarif(result)) as { runs: Array<{ properties: { evergreenData: Record<string, string> } }> };
  assert.deepEqual(Object.keys(sarif.runs[0]!.properties.evergreenData).sort(), ["reviewedThrough", "source", "version"]);
  assert.equal(sarif.runs[0]!.properties.evergreenData.version, result.data!.version);
  const later = { ...result, data: { ...result.data!, ageDays: result.data!.ageDays + 400, stale: true } };
  assert.equal(renderSarif(later), renderSarif(result), "the SARIF file does not depend on the data's age");
  const { data: _data, ...withoutData } = result;
  assert.equal("properties" in JSON.parse(renderSarif(withoutData)).runs[0], false);
});

test("the CLI and the Action carry the data information too", async () => {
  const directory = await project();
  const json = JSON.parse((await execute(process.execPath, [resolve("dist/src/cli.js"), "scan", directory, "--json"], { env: { ...process.env, EVERGREEN_DATA_DIR: await scratch("empty") } }).catch((error: { stdout: string }) => error)).stdout) as { data: { source: string } };
  assert.equal(json.data.source, "bundled");
  const checked = await execute(process.execPath, [resolve("dist/src/cli.js"), "check", "pkg:npm/express", "--json"]);
  assert.equal(JSON.parse(checked.stdout).data.source, "bundled");

  const summary = join(await scratch("summary"), "summary.md");
  await writeFile(summary, "");
  const output = await execute(process.execPath, [resolve("dist/action/index.js")], {
    env: { ...process.env, INPUT_PATH: directory, "INPUT_FAIL-ON-SEVERITY": "none", GITHUB_STEP_SUMMARY: summary, RUNNER_TEMP: await scratch("temp"), GITHUB_WORKSPACE: directory },
  });
  assert.match(await readFile(summary, "utf8"), /Data: bundled .+evidence reviewed through \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(output.stdout, /::warning title=Evergreen lifecycle data is stale/);
});
