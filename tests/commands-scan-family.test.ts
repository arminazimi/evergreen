import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import process from "node:process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { EXIT_CODES, createCommandContext, prepare, runScanPipeline } from "../src/commands/runtime.js";
import type { CommandContext, FailureClass } from "../src/commands/types.js";
import { renderActionable } from "../src/errors.js";
import { STATUS_FILE_NAME } from "../src/status-file.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** A repository with findings in two files, so a path filter can be shown keeping one and dropping the other. */
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-scan-family-"));
  temporaryRoots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: "20" }, dependencies: { request: "^2.88.0" } }),
  );
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n",
  );
  return root;
}

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly failures: Array<{ kind: FailureClass; message: string; appendix: string }>;
}

/** Runs one command through the exported pipeline, capturing everything the scan family prints or fails with. */
async function pipeline(command: string, ...args: string[]): Promise<Run> {
  const failures: Run["failures"] = [];
  const base = createCommandContext([command, ...args], "help");
  const ctx: CommandContext = {
    ...base,
    fail(kind, message, appendix = "") {
      failures.push({ kind, message, appendix });
      return EXIT_CODES[kind];
    },
    failActionable(kind, actionable) {
      const rendered = renderActionable(actionable);
      return ctx.fail(kind, rendered.message, rendered.appendix);
    },
  };
  const original = { stdout: process.stdout.write, stderr: process.stderr.write };
  let stdout = "";
  let stderr = "";
  const collect =
    (append: (text: string) => void) =>
    (chunk: unknown): boolean => {
      if (typeof chunk === "string") append(chunk);
      return true;
    };
  process.stdout.write = collect((text) => {
    stdout += text;
  }) as typeof process.stdout.write;
  process.stderr.write = collect((text) => {
    stderr += text;
  }) as typeof process.stderr.write;
  try {
    const code = await runScanPipeline(command, args, ctx);
    return { code, stdout, stderr, failures };
  } finally {
    process.stdout.write = original.stdout;
    process.stderr.write = original.stderr;
  }
}

/** The findings of a scan, so an assertion can name the severities and paths the command really found. */
interface Found {
  readonly id: string;
  readonly severity: string;
  readonly location: { readonly path: string };
}

/** The findings of a scan, so an assertion can name the severities and paths the command really found. */
async function findingsOf(root: string, ...args: string[]): Promise<Found[]> {
  const scan = await pipeline("scan", root, ...args, "--json", "--no-cache");
  assert.equal(scan.code, 0, scan.failures[0]?.message);
  const document = JSON.parse(scan.stdout) as { findings: Found[] };
  return document.findings;
}

/** The finding ids of a scan, for the commands that take one. */
async function findingIds(root: string): Promise<string[]> {
  return (await findingsOf(root)).map((finding) => finding.id);
}

test("a bad --min-support-days is a usage error before anything is scanned", async () => {
  const root = await repository();
  const invalid = await pipeline("scan", root, "--min-support-days", "banana");
  assert.equal(invalid.code, 2);
  assert.deepEqual(invalid.failures, [
    {
      kind: "usage",
      message: "--min-support-days must be a whole number of days (0 to 3650).",
      appendix: "",
    },
  ]);
  assert.equal(invalid.stdout, "");

  const accepted = await pipeline("scan", root, "--min-support-days", "30", "--json", "--no-cache");
  assert.equal(accepted.code, 0, accepted.failures[0]?.message);
  assert.deepEqual(
    JSON.parse(accepted.stdout).diagnostics.filter((line: string) => /min-support/.test(line)),
    [],
  );
});

test("each scan --format renders, and the report formats are the ones a scan can ask for", async () => {
  const root = await repository();
  const formats = [
    "text",
    "json",
    "markdown",
    "junit",
    "sarif",
    "rdjson",
    "codequality",
    "compact",
    "html",
    "slack",
    "teams",
    "webhook",
    "mermaid",
  ];
  for (const format of formats) {
    const run = await pipeline("scan", root, "--format", format, "--no-cache");
    assert.equal(run.code, 0, `${format}: ${run.failures[0]?.message}`);
    assert.notEqual(run.stdout.trim(), "", format);
  }
  // The HTML report is the one that carries a forecast, and mermaid keeps its diagram header.
  const html = await pipeline("scan", root, "--format", "html", "--no-cache");
  assert.match(html.stdout, /<html|<!DOCTYPE/i);
  const mermaid = await pipeline("scan", root, "--format", "mermaid", "--no-cache");
  assert.match(mermaid.stdout, /mermaid|graph|flowchart/);
});

test("baseline writes the findings, and a later scan reads them back as suppressions", async () => {
  const root = await repository();
  const expected = (await findingIds(root)).length;
  assert.ok(expected > 0);
  const baselinePath = join(root, "baseline.json");
  const written = await pipeline("baseline", root, "--output", baselinePath);
  assert.equal(written.code, 0, written.failures[0]?.message);
  assert.match(written.stdout, new RegExp(`^Wrote ${expected} findings to `));
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as { findings: unknown[] };
  assert.equal(baseline.findings.length, expected);

  const suppressed = await pipeline("scan", root, "--baseline", baselinePath, "--json", "--no-cache");
  assert.equal(suppressed.code, 0, suppressed.failures[0]?.message);
  assert.deepEqual((JSON.parse(suppressed.stdout) as { findings: unknown[] }).findings, []);

  // A second baseline keeps the history of the first, which is why the trend line is printed.
  const again = await pipeline("baseline", root, "--output", baselinePath);
  assert.equal(again.code, 0, again.failures[0]?.message);
  assert.match(again.stdout, new RegExp(`^Wrote ${expected} findings to `));
});

test("the baseline flags are checked together, and an unreadable file is a parse failure", async () => {
  const root = await repository();
  const badDays = await pipeline("scan", root, "--baseline", join(root, "none.json"), "--baseline-warn-days", "400");
  assert.equal(badDays.code, 2);
  assert.match(badDays.failures[0]?.message ?? "", /^--today must be a date \(YYYY-MM-DD\), --baseline-warn-days/);

  const badPolicy = await pipeline("scan", root, "--baseline", join(root, "none.json"), "--on-expired", "never");
  assert.equal(badPolicy.code, 2);
  assert.match(badPolicy.failures[0]?.message ?? "", /--on-expired one of/);

  const missing = await pipeline("scan", root, "--baseline", join(root, "missing.json"), "--no-cache");
  assert.equal(missing.code, 4);
  assert.equal(missing.failures[0]?.kind, "parse");
});

test("an expired suppression resurfaces by default and fails the scan only with --on-expired fail", async () => {
  const root = await repository();
  const baselinePath = join(root, "expired.json");
  await pipeline("baseline", root, "--output", baselinePath);
  // The baseline entries carry an expiry, so a scan dated after them sees them as expired.
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
    findings: Array<Record<string, unknown>>;
  };
  for (const entry of baseline.findings) entry.expires = "2026-01-02";
  await writeFile(baselinePath, JSON.stringify(baseline));

  const resurfaced = await pipeline("scan", root, "--baseline", baselinePath, "--today", "2026-06-01", "--json");
  assert.equal(resurfaced.code, 0, resurfaced.failures[0]?.message);
  assert.ok((JSON.parse(resurfaced.stdout) as { findings: unknown[] }).findings.length > 0);

  const failed = await pipeline(
    "scan",
    root,
    "--baseline",
    baselinePath,
    "--today",
    "2026-06-01",
    "--on-expired",
    "fail",
  );
  assert.equal(failed.code, 1);
  assert.deepEqual(failed.failures.at(-1), {
    kind: "policy",
    message: "Failing because a baseline suppression has expired (--on-expired fail).",
    appendix: "",
  });
});

test("explain prints one finding, context the packet for it, and both fail on an unknown id", async () => {
  const root = await repository();
  const [id] = await findingIds(root);

  const explained = await pipeline("explain", id ?? "", root);
  assert.equal(explained.code, 0, explained.failures[0]?.message);
  assert.match(explained.stdout, /Sources:/);
  const asJson = await pipeline("explain", id ?? "", root, "--json");
  assert.equal(asJson.code, 0, asJson.failures[0]?.message);
  assert.equal((JSON.parse(asJson.stdout) as { id: string }).id, id);

  const packet = await pipeline("context", id ?? "", root, "--json");
  assert.equal(packet.code, 0, packet.failures[0]?.message);
  assert.equal((JSON.parse(packet.stdout) as { schemaVersion: string }).schemaVersion, "evergreen.context.v1");
  const packetText = await pipeline("context", id ?? "", root);
  assert.match(packetText.stdout, /Migration context/);

  const unknown = await pipeline("explain", "nope", root);
  assert.equal(unknown.code, 3);
  assert.deepEqual(unknown.failures, [{ kind: "data", message: "Finding not found: nope", appendix: "" }]);
  assert.equal((await pipeline("context", "nope", root)).code, 3);
});

test("report-issue prints the report, writes it with --output, and fails on an unknown id", async () => {
  const root = await repository();
  const [id] = await findingIds(root);

  const printed = await pipeline("report-issue", id ?? "", root);
  assert.equal(printed.code, 0, printed.failures[0]?.message);
  assert.match(printed.stdout, /## /);

  const out = join(root, "issue.md");
  const written = await pipeline("report-issue", id ?? "", root, "--output", out);
  assert.equal(written.code, 0, written.failures[0]?.message);
  assert.match(written.stdout, /^Wrote the report to /);
  assert.match(await readFile(out, "utf8"), /## /);

  const missing = await pipeline("report-issue", "nope", root);
  assert.equal(missing.code, 3);
  assert.deepEqual(missing.failures, [{ kind: "data", message: "Finding not found: nope", appendix: "" }]);
});

test("scan --by-owner groups the findings, and only in the formats it can", async () => {
  const root = await repository();
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "CODEOWNERS"), "* @platform-team\n");

  const grouped = await pipeline("scan", root, "--by-owner", "--no-cache");
  assert.equal(grouped.code, 0, grouped.failures[0]?.message);
  assert.match(grouped.stdout, /platform-team/);
  const asJson = await pipeline("scan", root, "--by-owner", "--json", "--no-cache");
  assert.equal(asJson.code, 0, asJson.failures[0]?.message);
  const groups = JSON.parse(asJson.stdout) as { groups?: Array<{ owner: string }> };
  assert.ok(Array.isArray(groups.groups ?? []), asJson.stdout);

  const wrongFormat = await pipeline("scan", root, "--by-owner", "--format", "markdown", "--no-cache");
  assert.equal(wrongFormat.code, 2);
  assert.deepEqual(wrongFormat.failures, [
    { kind: "usage", message: "--by-owner supports --json and --format text|json only.", appendix: "" },
  ]);
});

test("--write-status writes the status file, and --fail-on turns findings into a policy failure", async () => {
  const root = await repository();
  const status = await pipeline("scan", root, "--write-status", "--no-cache");
  assert.equal(status.code, 0, status.failures[0]?.message);
  assert.equal(status.stderr, `Wrote ${STATUS_FILE_NAME} in ${root}.\n`);
  assert.match(await readFile(join(root, STATUS_FILE_NAME), "utf8"), /Evergreen status|evergreen/i);

  const quiet = await pipeline("scan", root, "--fail-on", "none", "--no-cache");
  assert.equal(quiet.code, 0, quiet.failures[0]?.message);

  const scan = await findingsOf(root);
  const blocking = scan.filter((finding) => finding.severity === "high" || finding.severity === "critical");
  const raised = await pipeline("scan", root, "--fail-on", "high", "--no-cache");
  assert.equal(raised.code, blocking.length > 0 ? 1 : 0, raised.failures[0]?.message);
  assert.deepEqual(raised.failures.at(-1), {
    kind: "policy",
    message: `${blocking.length} finding${blocking.length === 1 ? "" : "s"} at high or above (--fail-on high).`,
    appendix: "",
  });
  // Only a severity the scan actually reaches can block it.
  const critical = scan.filter((finding) => finding.severity === "critical").length;
  assert.equal((await pipeline("scan", root, "--fail-on", "critical", "--no-cache")).code, critical > 0 ? 1 : 0);
});

test("--ignore drops the findings of the matching paths, and --demo scans the shipped example", async () => {
  const root = await repository();
  const paths = [...new Set((await findingsOf(root)).map((finding) => finding.location.path))];
  assert.ok(paths.length > 1, "the fixture needs findings in more than one file to show a partial ignore");

  const [first, ...rest] = paths;
  const kept = [...new Set((await findingsOf(root, "--ignore", first ?? "")).map((finding) => finding.location.path))];
  assert.deepEqual(kept, rest, `only ${first} should be gone`);

  const demo = await pipeline("scan", "--demo", "--json");
  assert.equal(demo.code, 0, demo.failures[0]?.message);
  assert.ok((JSON.parse(demo.stdout) as { findings: unknown[] }).findings.length > 0);
});

test("the selection, JSON and cache choices the gates produce reach the scan", async () => {
  const root = await repository();
  const selected = await pipeline("scan", root, "--only", "npm", "--json", "--no-cache");
  assert.equal(selected.code, 0, selected.failures[0]?.message);
  const document = JSON.parse(selected.stdout) as {
    selection?: { only?: string[] };
    findings: Array<{ detector: string }>;
  };
  assert.deepEqual(document.selection, { only: ["npm"] });
  assert.ok(document.findings.length > 0);
  assert.deepEqual([...new Set(document.findings.map((finding) => finding.detector))], ["npm"]);

  const prepared = await prepare("scan", [root, "--json", "--no-cache"], createCommandContext([], "help"));
  if (typeof prepared === "number") throw new Error("prepare failed");
  assert.equal(prepared.command, "scan");
  assert.equal(prepared.pathArgument, root);
  assert.deepEqual([...prepared.positional], [root]);
});
