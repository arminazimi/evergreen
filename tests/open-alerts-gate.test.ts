import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const toolPath = resolve("tools/open-alerts-gate.mjs");
const baselinePath = resolve("tools/open-alerts-baseline.json");

const tool = (await import(pathToFileURL(toolPath).href)) as {
  alertKey: (kind: string, alert: { number: number }) => string;
  openAlerts: (codeScanning: unknown, dependabot: unknown) => { key: string; summary: string; url: string }[];
  validateBaseline: (baseline: unknown) => string[];
  findNewAlerts: (
    open: { key: string; summary: string; url: string }[],
    acceptedKeys: string[],
  ) => { fresh: { key: string }[]; stale: string[] };
  main: (args: readonly string[]) => number;
};

const codeScanningAlert = (number: number, state = "open") => ({
  number,
  state,
  html_url: `https://github.com/example/repo/security/code-scanning/${number}`,
  rule: { id: "js/incomplete-sanitization" },
  most_recent_instance: { location: { path: "tools/example.ts" } },
});

const dependabotAlert = (number: number, state = "open") => ({
  number,
  state,
  html_url: `https://github.com/example/repo/security/dependabot/${number}`,
  dependency: { package: { name: "minimatch" }, manifest_path: "package-lock.json" },
  security_advisory: { ghsa_id: "GHSA-xxxx-xxxx-xxxx" },
});

function writeJson(name: string, document: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "evergreen-open-alerts-"));
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(document));
  return file;
}

function runTool(codeScanning: unknown, dependabot: unknown, baseline: unknown) {
  const args = [
    toolPath,
    "--code-scanning",
    writeJson("code-scanning.json", codeScanning),
    "--dependabot",
    writeJson("dependabot.json", dependabot),
    "--baseline",
    writeJson("baseline.json", baseline),
  ];
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

const baseline = (keys: string[]) => ({
  accepted: keys.map((key) => ({ key, reason: "accepted in a test" })),
});

test("the committed baseline is well formed and lists exactly the alerts open when the gate was added", () => {
  const committed = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.deepEqual(tool.validateBaseline(committed), []);
  const keys = committed.accepted.map((entry: { key: string }) => entry.key);
  assert.equal(keys.length, 17);
  assert.equal(new Set(keys).size, keys.length);
});

test("validateBaseline refuses a bad key, a duplicate, and an entry without a reason", () => {
  assert.deepEqual(tool.validateBaseline({ accepted: [{ key: "code-scanning#1", reason: "ok" }] }), []);
  assert.match(tool.validateBaseline({ accepted: [{ key: "pr#1", reason: "ok" }] }).join("\n"), /bad key/);
  assert.match(
    tool
      .validateBaseline({
        accepted: [
          { key: "dependabot#2", reason: "ok" },
          { key: "dependabot#2", reason: "ok" },
        ],
      })
      .join("\n"),
    /listed twice/,
  );
  assert.match(
    tool.validateBaseline({ accepted: [{ key: "dependabot#3", reason: " " }] }).join("\n"),
    /no written reason/,
  );
  assert.match(tool.validateBaseline({}).join("\n"), /accepted array/);
});

test("openAlerts keeps only open alerts and names each by kind and number", () => {
  const open = tool.openAlerts(
    [codeScanningAlert(7), codeScanningAlert(8, "dismissed")],
    [dependabotAlert(9), dependabotAlert(10, "fixed")],
  );
  assert.deepEqual(
    open.map((alert) => alert.key),
    ["code-scanning#7", "dependabot#9"],
  );
  assert.equal(open[0]?.summary, "js/incomplete-sanitization in tools/example.ts");
  assert.equal(open[1]?.summary, "minimatch in package-lock.json (GHSA-xxxx-xxxx-xxxx)");
  assert.equal(open[0]?.url, "https://github.com/example/repo/security/code-scanning/7");
  assert.equal(tool.alertKey("dependabot", { number: 66 }), "dependabot#66");
});

test("openAlerts refuses a response that is not a list of alerts", () => {
  assert.throws(() => tool.openAlerts({ message: "Not Found" }, []), /code-scanning alerts are not an array/);
  assert.throws(() => tool.openAlerts([], null), /Dependabot alerts are not an array/);
  assert.throws(() => tool.openAlerts([{ state: "open" }], []), /has no number/);
});

test("findNewAlerts flags alerts outside the baseline and reports baseline entries that closed", () => {
  const open = tool.openAlerts([codeScanningAlert(1), codeScanningAlert(2)], []);
  const result = tool.findNewAlerts(open, ["code-scanning#1", "dependabot#5"]);
  assert.deepEqual(
    result.fresh.map((alert) => alert.key),
    ["code-scanning#2"],
  );
  assert.deepEqual(result.stale, ["dependabot#5"]);
});

test("a new open alert fails the gate and the output links to it", () => {
  const result = runTool([codeScanningAlert(41)], [dependabotAlert(42)], baseline(["code-scanning#41"]));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /::error title=New open alert::dependabot#42/);
  assert.match(result.stdout, /https:\/\/github\.com\/example\/repo\/security\/dependabot\/42/);
  assert.doesNotMatch(result.stdout, /code-scanning#41/);
});

test("a repository whose open alerts all sit in the baseline passes and notes stale entries", () => {
  const result = runTool(
    [codeScanningAlert(41)],
    [dependabotAlert(42)],
    baseline(["code-scanning#41", "dependabot#42", "dependabot#99"]),
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /::notice title=Stale baseline entry::dependabot#99/);
  assert.match(result.stdout, /No open alerts outside the baseline \(2 open, 3 accepted\)/);
});

test("an empty alert list passes", () => {
  const result = runTool([], [], baseline([]));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("bad usage, unreadable input, and a malformed baseline exit 2", () => {
  const noFlags = spawnSync(process.execPath, [toolPath], { encoding: "utf8" });
  assert.equal(noFlags.status, 2);
  assert.match(noFlags.stderr, /usage:/);

  const badResponse = runTool({ message: "Forbidden" }, [], baseline([]));
  assert.equal(badResponse.status, 2);
  assert.match(badResponse.stderr, /cannot read the alerts/);

  const badBaseline = runTool([], [], { accepted: [{ key: "dependabot#1" }] });
  assert.equal(badBaseline.status, 2);
  assert.match(badBaseline.stderr, /no written reason/);
});
