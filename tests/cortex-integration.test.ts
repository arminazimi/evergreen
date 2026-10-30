import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

interface SeverityCounts { info: number; low: number; medium: number; high: number; critical: number }

interface PortalService {
  path: string;
  severities: SeverityCounts;
  nextEndOfLife?: string;
  reportLink: string;
}

interface PortalCatalog { schemaVersion: string; services: PortalService[] }

interface CortexValue {
  path: string;
  severities: SeverityCounts;
  nextEndOfLife?: string;
  reportLink: string;
}

interface CortexPayload { values: Record<string, Array<{ key: string; value: CortexValue }>> }

interface CortexMapper {
  CORTEX_CUSTOM_DATA_KEY: string;
  cortexTag(path: string): string;
  toCortexCustomData(catalog: PortalCatalog): CortexPayload;
}

const execute = promisify(execFile);
const mapperPath = resolve("integrations/cortex/map.mjs");
const mapper = (await import(pathToFileURL(mapperPath).href)) as CortexMapper;
const sample = JSON.parse(await readFile(resolve("integrations/cortex/sample-data/portal-export.json"), "utf8")) as PortalCatalog;
const validateSample = new Ajv2020({ allErrors: true }).compile(
  JSON.parse(await readFile(resolve("schemas/portal.v1.schema.json"), "utf8")) as object,
);

function payloadFor(payload: CortexPayload, scannedPath: string): CortexValue {
  const tag = mapper.cortexTag(scannedPath);
  const entries = payload.values[tag];
  assert.ok(entries, `no custom data for tag ${tag}`);
  const entry = entries.find((candidate) => candidate.key === mapper.CORTEX_CUSTOM_DATA_KEY);
  assert.ok(entry, `tag ${tag} has no ${mapper.CORTEX_CUSTOM_DATA_KEY} key`);
  return entry.value;
}

test("the sample catalog is a valid evergreen.portal.v1 export", () => {
  assert.equal(validateSample(sample), true, JSON.stringify(validateSample.errors));
});

test("each service becomes one custom-data entry under its entity tag", () => {
  const payload = mapper.toCortexCustomData(sample);
  const tags = Object.keys(payload.values);
  assert.equal(tags.length, sample.services.length);
  assert.deepEqual(tags, sample.services.map((service) => mapper.cortexTag(service.path)).sort());
  for (const service of sample.services) {
    const value = payloadFor(payload, service.path);
    assert.equal(value.path, service.path);
    assert.deepEqual(value.severities, service.severities);
    assert.equal(value.reportLink, service.reportLink);
  }
  const api = payloadFor(payload, "/repos/api");
  assert.equal(api.nextEndOfLife, "2026-12-31");
  assert.deepEqual(payload.values.api, [{ key: "evergreen-lifecycle", value: api }]);
});

test("a service without a deadline leaves nextEndOfLife unset", () => {
  const payload = mapper.toCortexCustomData(sample);
  assert.equal("nextEndOfLife" in payloadFor(payload, "/repos/checkout"), false);
});

test("tags come from the last path segment, normalized to lowercase letters, digits, and hyphens", () => {
  assert.equal(mapper.cortexTag("/repos/docs-site"), "docs-site");
  assert.equal(mapper.cortexTag("./services/api/"), "api");
  assert.equal(mapper.cortexTag("C:\\repos\\payments"), "payments");
  assert.equal(mapper.cortexTag("/repos/Internal_Tools"), "internal-tools");
  assert.equal(mapper.cortexTag("/repos/docs-site"), basename("/repos/docs-site"));
});

test("mapping is deterministic and refuses two paths that produce the same tag", () => {
  const forward = mapper.toCortexCustomData(sample);
  const backward = mapper.toCortexCustomData({ ...sample, services: [...sample.services].reverse() });
  assert.deepEqual(backward, forward);
  const service = (path: string): PortalService => ({
    path,
    severities: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
    reportLink: "report.json",
  });
  assert.throws(
    () => mapper.toCortexCustomData({ schemaVersion: "evergreen.portal.v1", services: [service("/apps/api"), service("/services/api")] }),
    /two scanned paths map to the Cortex tag "api"/,
  );
});

test("mapping refuses other schema versions and incomplete services", () => {
  assert.throws(
    () => mapper.toCortexCustomData({ schemaVersion: "evergreen.portal.v2", services: [] }),
    /expected a evergreen\.portal\.v1 export/,
  );
  assert.throws(
    () => mapper.toCortexCustomData({
      schemaVersion: "evergreen.portal.v1",
      services: [{ path: "/repos/api", reportLink: "a.json" }] as unknown as PortalService[],
    }),
    /"\/repos\/api" has no info count/,
  );
});

test("the CLI prints the same payload for the sample and exits 2 without a file", async () => {
  const { stdout } = await execute(process.execPath, [mapperPath, "integrations/cortex/sample-data/portal-export.json"]);
  assert.deepEqual(JSON.parse(stdout), mapper.toCortexCustomData(sample));
  await assert.rejects(execute(process.execPath, [mapperPath]), (error: unknown) => {
    const failure = error as { code: number; stderr: string };
    assert.equal(failure.code, 2);
    assert.match(failure.stderr, /Usage: node integrations\/cortex\/map\.mjs <evergreen-portal\.json>/);
    return true;
  });
});
