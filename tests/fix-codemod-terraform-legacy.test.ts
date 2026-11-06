import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { prepareHcl } from "../src/detectors/terraform/hcl.js";
import { parseTerraformFile } from "../src/detectors/terraform/parse-terraform.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine/index.js";
import { terraformLegacyFixer } from "../src/fix/index.js";
import { applyPatches as apply, cleanup, repository } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/terraform-legacy");

after(cleanup);

interface Refusal {
  ruleId: string;
  line: number | undefined;
  reason: string;
}

async function plan(root: string): Promise<{
  result: ScanResult;
  patches: Awaited<ReturnType<typeof terraformLegacyFixer.plan>>;
  refusals: Refusal[];
}> {
  const result = await scanRepository(root, detectors);
  const refusals: Refusal[] = [];
  const patches = await terraformLegacyFixer.plan(result, (finding, reason) => {
    refusals.push({ ruleId: finding.ruleId, line: finding.location.line, reason });
  });
  return { result, patches, refusals };
}

function finding(
  path: string,
  line: number | undefined,
  ruleId = "terraform.syntax.interpolation-only",
  column?: number,
): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? 0}:${column ?? 0}`,
    ruleId,
    detector: "terraform",
    title: "Legacy Terraform syntax",
    summary: "Legacy Terraform syntax.",
    severity: "low",
    confidence: "exact",
    location: { path, ...(line === undefined ? {} : { line }), ...(column === undefined ? {} : { column }) },
    sources: [{ title: "Terraform", url: "https://developer.hashicorp.com/terraform" }],
  };
}

function manualScan(root: string, findings: Finding[]): ScanResult {
  return {
    schemaVersion: "evergreen.scan.v1",
    root,
    scannedAt: "2026-10-31T00:00:00.000Z",
    findings,
    diagnostics: [],
  };
}

test("the planner rewrites the before fixture to the after fixture and never writes in place", async () => {
  const before = await readFile(join(fixtures, "before.tf"), "utf8");
  const after = await readFile(join(fixtures, "after.tf"), "utf8");
  const root = await repository({ "main.tf": before });
  const { patches } = await plan(root);

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "main.tf");
  assert.ok(patches[0]!.diff.includes('\n-  name        = "${var.name}"\n'));
  assert.ok(patches[0]!.diff.includes("\n+  name        = var.name\n"));
  assert.ok(patches[0]!.diff.includes("\n-  ports       = list(80, 443)\n"));
  assert.ok(patches[0]!.diff.includes("\n+  ports       = tolist([80, 443])\n"));
  assert.equal(await readFile(join(root, "main.tf"), "utf8"), before, "planning must not modify the file");
  assert.deepEqual(
    await terraformLegacyFixer.plan(await scanRepository(root, detectors)),
    patches,
    "the plan is deterministic",
  );

  await apply(root, patches);
  assert.equal(await readFile(join(root, "main.tf"), "utf8"), after);
  assert.notEqual(prepareHcl(after), undefined, "the patched file must still parse as HCL");
  assert.deepEqual(parseTerraformFile(after), [{ kind: "required_version", value: ">= 1.5.0", line: 2 }]);

  const afterScan = await scanRepository(root, detectors);
  assert.deepEqual(afterScan.findings, []);
  assert.deepEqual(await terraformLegacyFixer.plan(afterScan), [], "a second pass has nothing to do");
});

test("rewrites every removable call on one line, including a call nested in an interpolation", async () => {
  const root = await repository({
    "main.tf": `locals {
  both   = [list(1, 2), list(3)]
  nested = "\${list("a")}"
}
`,
  });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  await apply(root, patches);
  assert.equal(
    await readFile(join(root, "main.tf"), "utf8"),
    `locals {
  both   = [tolist([1, 2]), tolist([3])]
  nested = tolist(["a"])
}
`,
  );
  assert.deepEqual((await scanRepository(root, detectors)).findings, []);
});

test("refuses a multiline call, an invalid argument count, a non-string map key, and a key or label string", async () => {
  const before = `locals {
  multiline = list(
    "a",
  )
  none      = list()
  odd       = map("a")
  barekey   = map(var.key, "v")
  object    = {
    "\${var.name}" = "value"
  }
}
resource "aws_instance" "\${var.name}" {}
`;
  const root = await repository({ "main.tf": before });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals
      .map((refusal) => [refusal.line, refusal.reason])
      .sort((left, right) => (left[0] as number) - (right[0] as number)),
    [
      [2, "The call's arguments are not all on one line."],
      [5, "The list() call has no arguments."],
      [6, "The map() call does not have an even number of arguments."],
      [7, "The map() key is not a quoted string or an identifier."],
      [9, "The string is an object key; removing its quotes would change the key syntax."],
      [12, "The string is a block label; removing its quotes would not be valid HCL."],
    ],
  );
  assert.equal(await readFile(join(root, "main.tf"), "utf8"), before);
});

test("refuses generated files and files without a trailing newline", async () => {
  const root = await repository({
    "generated.tf": '# Code generated by terraform-docs. DO NOT EDIT.\nlocals {\n  name = "${var.name}"\n}\n',
    "plain.tf": 'locals {\n  name = "${var.name}"\n}',
  });
  const { patches, refusals } = await plan(root);

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals
      .map((refusal) => [refusal.ruleId, refusal.line, refusal.reason])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["terraform.syntax.interpolation-only", 3, "The file says another tool generates it."],
      ["terraform.syntax.interpolation-only", 2, "The Terraform file does not end with a newline."],
    ],
  );
});

test("refuses a finding under .terraform/, outside the root, at a missing file, at no line, or at a stale line", async () => {
  const root = await repository({ "main.tf": 'locals {\n  name = "${var.name}"\n}\n' });
  const result = manualScan(root, [
    finding(".terraform/modules/x/main.tf", 2),
    finding("../outside.tf", 1),
    finding("missing.tf", 1),
    finding("main.tf", undefined),
    finding("main.tf", 5),
  ]);
  const refusals: Refusal[] = [];
  const patches = await terraformLegacyFixer.plan(result, (item, reason) => {
    refusals.push({ ruleId: item.ruleId, line: item.location.line, reason });
  });

  assert.deepEqual(patches, []);
  assert.deepEqual(
    refusals.map((refusal) => refusal.reason),
    [
      "The file is inside .terraform/, which Terraform generates.",
      "The finding names no line to rewrite.",
      "The path resolves outside the repository.",
      "The line no longer holds the legacy syntax the finding names.",
      "The Terraform file could not be read.",
    ],
  );
});

test("ignores findings from other detectors and other rule ids", async () => {
  const root = await repository({ "main.tf": 'locals {\n  name = "${var.name}"\n}\n' });
  const npm = { ...finding("package.json", 3, "npm.request"), detector: "npm" };
  const other = finding("main.tf", 2, "terraform.cli.end-of-support-1.12");
  assert.deepEqual(await terraformLegacyFixer.plan(manualScan(root, [npm, other])), []);
});
