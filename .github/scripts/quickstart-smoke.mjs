// Quickstart smoke for the release workflow: runs the commands of tests/quickstart.md.
//
//   node quickstart-smoke.mjs --published <version>
//   node quickstart-smoke.mjs --local <cli-path>
//
// `--published` uses `npx --yes evergreen-deprecation@<version>` (the real release path).
// `--local` uses a built CLI path so a dry-run stage can exercise the same checks without npm.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const mode = process.argv[2];
const target = process.argv[3];
if ((mode !== "--published" && mode !== "--local") || !target) {
  console.error("Usage: quickstart-smoke.mjs --published <version> | --local <cli-path>");
  process.exit(2);
}

const windows = process.platform === "win32";
const command =
  mode === "--published" ? ["npx", "--yes", `evergreen-deprecation@${target}`] : ["node", target];

function run(args) {
  const [program, ...rest] = command;
  const result = spawnSync(program, [...rest, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: windows,
  });
  if (result.error) throw new Error(`${[...command, ...args].join(" ")} could not run: ${result.error.message}`);
  return result;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function expect(condition, message) {
  if (!condition) fail(message);
  console.log(`ok: ${message}`);
}

function jsonOf(result, args, statusExpected) {
  expect(result.status === statusExpected, `${args.join(" ")} exits ${statusExpected} (got ${result.status})`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    fail(`${args.join(" ")} prints JSON`);
  }
  return parsed;
}

function parseJson(schema, value, what) {
  expect(value?.schemaVersion === schema, `${what} reports ${schema} (got ${value?.schemaVersion})`);
  return value;
}

const id = "npm.package.request.deprecated:package.json:5";

// After a published warm-up smoke, this times scan startup on a warmed cache without download variance.
const startedAt = Date.now();
const scan = jsonOf(run(["scan", ".", "--json"]), ["scan", ".", "--json"], 0);
const durationMs = Date.now() - startedAt;
const durationSec = (durationMs / 1000).toFixed(2);
parseJson("evergreen.scan.v1", scan, "the JSON scan");
const ruleIds = new Set((scan.findings ?? []).map((finding) => finding.ruleId));
expect(ruleIds.has("npm.package.request.deprecated"), "the scan finds the deprecated package");
expect([...ruleIds].some((ruleId) => ruleId.startsWith("nodejs.runtime.")), "the scan finds the end-of-life Node.js range");
expect(scan.unclassified?.count === 0, "the smoke fixture has nothing unclassified");
expect(durationMs <= 120000, `time to first useful finding stays under the two-minute budget (${durationSec}s <= 120s)`);
console.log(`Time to first useful finding: ${durationSec}s on ${process.platform} (goal: under 120s)`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const osName = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const row = `| ${osName} | ${durationSec} s | < 120 s | ${(scan.findings ?? []).length} | \`npm.package.request.deprecated\` | Pass |\n`;
  if (!existsSync(summaryPath) || !readFileSync(summaryPath, "utf8").includes("Time to first useful finding")) {
    appendFileSync(summaryPath, "\n### Time to first useful finding\n\n| Platform | First run duration | Goal | Findings | First finding | Result |\n|---|---|---|---|---|---|\n" + row);
  } else {
    appendFileSync(summaryPath, row);
  }
}

const compact = run(["scan", ".", "--format", "compact"]);
expect(compact.status === 0, `scan --format compact exits 0 (got ${compact.status})`);
const lines = compact.stdout.trimEnd().split(/\r?\n/);
const count = /^Evergreen: (\d+) findings?$/.exec(lines[0]);
expect(count !== null && Number(count[1]) > 0, `the compact header counts the findings (got ${lines[0]})`);
expect(Buffer.byteLength(compact.stdout, "utf8") <= 8192, "the compact report stays under the documented 8 KiB cap");
expect(lines.some((line) => line.startsWith("npm.package.request.deprecated:package.json:5 package.json:5 high ")),
  "the compact report lists the deprecated package first");
for (const line of lines.slice(1)) {
  if (/^\d+ more findings? omitted\b/.test(line)) continue;
  const columns = line.split(" ");
  expect(/^\S+:\S+:\d+$/.test(columns[0]) && /^\S+:\d+$/.test(columns[1]) && ["high", "medium", "low", "info"].includes(columns[2]) && columns.length >= 4,
    `the compact line has the documented id, location, severity, and replacement columns (got ${line})`);
}

const doctor = run(["doctor", "."]);
expect(doctor.status === 0, `doctor exits 0 (got ${doctor.status})`);
expect(doctor.stdout.includes("Status: ready-with-warnings"), "doctor reports ready-with-warnings");
expect(doctor.stdout.includes("Privacy: no repository data was uploaded and no configuration was changed."),
  "doctor closes with the privacy promise");

const doctorJson = jsonOf(run(["doctor", ".", "--json"]), ["doctor", ".", "--json"], 0);
parseJson("evergreen.doctor.v1", doctorJson, "the JSON doctor");
expect(doctorJson.summary?.failed === 0, "doctor reports no failed check");
expect(doctorJson.summary?.status === "ready-with-warnings", "the JSON doctor reports ready-with-warnings");

const capabilities = jsonOf(run(["capabilities", "--json"]), ["capabilities", "--json"], 0);
parseJson("evergreen.capabilities.v1", capabilities, "the manifest");
expect(Array.isArray(capabilities.ecosystems) && capabilities.ecosystems.some((ecosystem) => ecosystem.id === "npm"),
  "the manifest ships the npm ecosystem");

const checkPurl = "pkg:npm/request@2.88.2";
const check = run(["check", checkPurl]);
expect(check.status === 1, `check exits 1 for a high-severity affected rule (got ${check.status})`);
expect(check.stdout.includes("Status: affected (high)"), "check reports Status: affected (high)");
expect(check.stdout.split(/\r?\n/).includes("Source: https://www.npmjs.com/package/request"), "check names the evidence source");

const checkJson = jsonOf(run(["check", checkPurl, "--json"]), ["check", checkPurl, "--json"], 1);
parseJson("evergreen.check.v1", checkJson, "the JSON check");
expect(checkJson.status === "affected" && (checkJson.findings ?? []).some((finding) => finding.severity === "high"),
  "the JSON check reports an affected high finding");

const dataStatus = run(["data", "status"]);
expect(dataStatus.status === 0 && dataStatus.stdout.includes("Source: bundled"), "the quickstart works on bundled data");

const explain = run(["explain", id, "."]);
expect(explain.status === 0 && explain.stdout.includes("Rule: npm.package.request.deprecated") && explain.stdout.includes("Location: package.json:5") && explain.stdout.includes("Sources:"),
  `explain ${id} prints rule, location, and sources`);

const context = jsonOf(run(["context", id, ".", "--json"]), ["context", id, ".", "--json"], 0);
parseJson("evergreen.context.v1", context, "the migration context");

const baseline = run(["baseline", "."]);
expect(baseline.status === 0 && baseline.stdout.includes("Wrote"), `baseline exits 0 and writes (exit ${baseline.status})`);
expect(existsSync(".evergreen-baseline.json"), "baseline leaves .evergreen-baseline.json in the project");

const accepted = jsonOf(run(["scan", ".", "--baseline", ".evergreen-baseline.json", "--json"]), ["scan", ".", "--baseline", ".evergreen-baseline.json", "--json"], 0);
parseJson("evergreen.scan.v1", accepted, "the baseline scan");
expect((accepted.findings ?? []).length === 0, "the baseline accepts every fixture finding");

console.log("Quickstart smoke test passed.");
