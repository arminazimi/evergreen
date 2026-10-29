import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { Finding, Severity } from "../src/domain.js";
import { PORTAL_SCHEMA_VERSION, exportPortal, portalReportLink } from "../src/export/portal.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(severity: Severity, deadline?: string): Finding {
  return {
    id: `rule:${severity}:${deadline ?? "none"}`,
    ruleId: "example.rule",
    detector: "npm",
    title: "t",
    summary: "s",
    severity,
    confidence: "exact",
    location: { path: "package.json" },
    sources: [],
    ...(deadline !== undefined ? { deadline } : {}),
  };
}

async function loadValidate() {
  const schema = JSON.parse(await readFile(resolve("schemas/portal.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test("exportPortal counts severities, picks the earliest deadline, and sorts by path", async () => {
  const validate = await loadValidate();
  const catalog = exportPortal([
    {
      path: "/repos/web",
      findings: [finding("high", "2026-06-01"), finding("low"), finding("high", "2025-01-01")],
      reportLink: "evergreen-report-web.json",
    },
    {
      path: "/repos/api",
      findings: [finding("medium", "2027-01-01")],
      reportLink: "https://ci.example.com/evergreen-report-api.json",
    },
  ]);
  assert.deepEqual(catalog, exportPortal([...catalog.services].reverse().map((service) => ({
    path: service.path,
    findings: service.path.endsWith("web")
      ? [finding("high", "2026-06-01"), finding("low"), finding("high", "2025-01-01")]
      : [finding("medium", "2027-01-01")],
    reportLink: service.reportLink,
  }))));
  assert.equal(catalog.schemaVersion, PORTAL_SCHEMA_VERSION);
  assert.deepEqual(catalog.services.map((service) => service.path), ["/repos/api", "/repos/web"]);
  assert.equal(catalog.services[0]!.nextEndOfLife, "2027-01-01");
  assert.equal(catalog.services[1]!.nextEndOfLife, "2025-01-01");
  assert.deepEqual(catalog.services[1]!.severities, { info: 0, low: 1, medium: 0, high: 2, critical: 0 });
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
});

test("exportPortal omits nextEndOfLife when no finding has a deadline", async () => {
  const validate = await loadValidate();
  const catalog = exportPortal([{ path: "/clean", findings: [finding("info")], reportLink: "evergreen-report-clean.json" }]);
  assert.equal(catalog.services[0]!.nextEndOfLife, undefined);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...catalog, extra: true }), false);
});

test("portalReportLink builds conventional artifact names and absolute URLs", () => {
  assert.equal(portalReportLink("/tmp/payments"), "evergreen-report-payments.json");
  assert.equal(
    portalReportLink("/tmp/payments", "https://ci.example.com/artifacts"),
    "https://ci.example.com/artifacts/evergreen-report-payments.json",
  );
  assert.equal(
    portalReportLink("/tmp/payments", "https://ci.example.com/artifacts/"),
    "https://ci.example.com/artifacts/evergreen-report-payments.json",
  );
});

test("CLI export --format portal scans paths and matches schemas/portal.v1.schema.json", async () => {
  const validate = await loadValidate();
  const root = await mkdtemp(join(tmpdir(), "evergreen-portal-"));
  roots.push(root);
  const api = join(root, "api");
  const web = join(root, "web");
  await mkdir(api);
  await mkdir(web);
  await writeFile(join(api, "package.json"), JSON.stringify({ name: "api", dependencies: { request: "2.88.2" } }));
  await writeFile(join(web, "package.json"), JSON.stringify({ name: "web", dependencies: { express: "4.18.2" } }));

  const args = [
    cli, "export", "--format", "portal", api, web,
    "--data-version", "bundled",
    "--report-base-url", "https://ci.example.com/artifacts/",
  ];
  const first = await execute(process.execPath, args);
  const second = await execute(process.execPath, args);
  assert.equal(first.stdout, second.stdout);
  const catalog = JSON.parse(first.stdout);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
  assert.equal(catalog.schemaVersion, PORTAL_SCHEMA_VERSION);
  assert.equal(catalog.services.length, 2);
  assert.deepEqual(catalog.services.map((service: { path: string }) => service.path), [api, web].map((path) => resolve(path)).sort());
  for (const service of catalog.services) {
    assert.match(service.reportLink, /^https:\/\/ci\.example\.com\/artifacts\/evergreen-report-(api|web)\.json$/);
    assert.equal(typeof service.severities.high, "number");
  }
  const apiService = catalog.services.find((service: { path: string }) => service.path === resolve(api));
  assert.ok(apiService);
  assert.ok(apiService.severities.high + apiService.severities.critical + apiService.severities.medium > 0);
});

test("CLI rejects incomplete portal export options", async () => {
  for (const args of [
    ["export", "--format", "portal", "--report-base-url"],
    ["export", "--format", "portal", "--json"],
    ["export", "--format", "cle", "--report-base-url", "https://example.com/"],
  ]) {
    await assert.rejects(execute(process.execPath, [cli, ...args]), (error: unknown) => {
      const failure = error as { code: number; stderr: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr, /Usage: evergreen export|--report-base-url needs/);
      return true;
    });
  }
});
