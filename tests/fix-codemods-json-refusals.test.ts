import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import type { FixRefusal } from "../src/fix/index.js";
import { runCli } from "./cli-runner.js";

// Epic #1825: every refusal a codemod documents is reported with its reason under `refusals` in `fix --json`.
// The per-codemod tests assert the same reasons on the planner; these run the CLI so the JSON surface is covered
// for all ten codemods, node-renames and python-renames included in their own files.

const fixtures = resolve("tests/fixtures/fix");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function refusalsFor(fixer: string, files: Record<string, string>): Promise<FixRefusal[]> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-json-refusals-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const { stdout } = await runCli(["fix", root, "--json"]);
  const report = JSON.parse(stdout) as {
    schemaVersion: string;
    refusals: FixRefusal[];
  };
  assert.equal(report.schemaVersion, "evergreen.fix.v1");
  return report.refusals.filter((refusal) => refusal.fixer === fixer);
}

function assertReasons(refusals: FixRefusal[], expected: Array<string | RegExp>): void {
  assert.ok(refusals.length > 0, "no refusals were reported");
  for (const reason of expected) {
    assert.ok(
      refusals.some((refusal) =>
        typeof reason === "string" ? refusal.reason.includes(reason) : reason.test(refusal.reason),
      ),
      `missing refusal reason ${String(reason)}; got ${JSON.stringify(refusals.map((refusal) => refusal.reason))}`,
    );
  }
}

test("node-util-is refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("node-util-is", {
    "index.js": await readFile(join(fixtures, "node-util-is", "refusals.js"), "utf8"),
    "destructured.js": await readFile(join(fixtures, "node-util-is", "destructured.js"), "utf8"),
  });
  assertReasons(refusals, [
    "no exact native equivalent of `util.isError`",
    "spreads its argument",
    "passes no argument",
    "is reassigned in this file",
  ]);
});

test("node-buffer refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("node-buffer", {
    "index.js": await readFile(join(fixtures, "node-buffer", "refusals.js"), "utf8"),
  });
  assertReasons(refusals, ["is an identifier", /binary expression|template literal|SlowBuffer/u]);
});

test("python-utcnow refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("python-utcnow", {
    "app.py":
      "import datetime\n\na = datetime.datetime.utcnow(1)\nb = datetime.datetime.utcfromtimestamp(*args)\nc = datetime.datetime.utcfromtimestamp(t, tz=x)\n",
  });
  assertReasons(refusals, ["takes no arguments", "splat argument"]);
});

test("python-imp refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("python-imp", {
    "app.py": "import imp\n\nfp = imp.find_module('x')\nm = imp.reload(a, file=b)\nn = imp.get_magic(1)\n",
  });
  assertReasons(refusals, ["imp.find_module", "keyword argument `file`", "takes no arguments"]);
});

test("workflow-commands refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("workflow-commands", {
    ".github/workflows/ci.yml":
      'name: ci\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo "::set-output name=x::a\\nb"\n      - run: >\n          echo ::set-output name=y::z\n',
  });
  assertReasons(refusals, [/Folded|escapes|newline/u]);
});

test("kubernetes-ingress-v1 refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("kubernetes-ingress-v1", {
    "charts/templates/ingress.yaml":
      "apiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: {{ .Release.Name }}\nspec:\n  backend:\n    serviceName: web\n    servicePort: 80\n",
  });
  assertReasons(refusals, ["Helm template"]);
});

test("dockerfile-legacy refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("dockerfile-legacy", {
    Dockerfile: 'FROM node:24\nMAINTAINER Dev "Ops"\nENV A hello \\\nworld\nONBUILD ENV B c\n',
  });
  assertReasons(refusals, ["contains a quote", "continues on another line", "ONBUILD trigger"]);
});

test("terraform-legacy refusals appear in fix --json", async () => {
  const refusals = await refusalsFor("terraform-legacy", {
    "main.tf": 'locals {\n  none = list()\n  odd  = map("a")\n  multi = list(\n    "a",\n  )\n}\n',
  });
  assert.ok(refusals.length >= 2);
  assert.ok(refusals.every((refusal) => refusal.reason.length > 0));
});
