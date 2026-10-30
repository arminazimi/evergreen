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

interface PortEntity {
  identifier: string;
  title: string;
  properties: Record<string, string | number>;
}

interface PortMapper {
  PORT_BLUEPRINT: string;
  portIdentifier(path: string): string;
  serviceName(path: string): string;
  toPortEntities(catalog: PortalCatalog): { entities: PortEntity[] };
}

interface Blueprint {
  identifier: string;
  schema: { properties: Record<string, { type: string }>; required: string[] };
}

const execute = promisify(execFile);
const mapperPath = resolve("integrations/port/map.mjs");
const mapper = (await import(pathToFileURL(mapperPath).href)) as PortMapper;
const sample = JSON.parse(await readFile(resolve("integrations/port/sample-data/portal-export.json"), "utf8")) as PortalCatalog;
const blueprint = JSON.parse(await readFile(resolve("integrations/port/blueprint.json"), "utf8")) as Blueprint;
const validateSample = new Ajv2020({ allErrors: true }).compile(
  JSON.parse(await readFile(resolve("schemas/portal.v1.schema.json"), "utf8")) as object,
);

function entityFor(entities: PortEntity[], scannedPath: string): PortEntity {
  const entity = entities.find((candidate) => candidate.properties.path === scannedPath);
  assert.ok(entity, `no entity for ${scannedPath}`);
  return entity;
}

test("the sample catalog is a valid evergreen.portal.v1 export", () => {
  assert.equal(validateSample(sample), true, JSON.stringify(validateSample.errors));
});

test("each service becomes one entity with its severity counts, total, and report link", () => {
  const { entities } = mapper.toPortEntities(sample);
  assert.equal(entities.length, sample.services.length);
  for (const service of sample.services) {
    const entity = entityFor(entities, service.path);
    assert.equal(entity.title, basename(service.path));
    assert.equal(entity.properties.findings_info, service.severities.info);
    assert.equal(entity.properties.findings_low, service.severities.low);
    assert.equal(entity.properties.findings_medium, service.severities.medium);
    assert.equal(entity.properties.findings_high, service.severities.high);
    assert.equal(entity.properties.findings_critical, service.severities.critical);
    assert.equal(entity.properties.findings_total, Object.values(service.severities).reduce((total, count) => total + count, 0));
    assert.equal(entity.properties.report_link, service.reportLink);
  }
  const legacy = entityFor(entities, "/repos/legacy-batch");
  assert.equal(legacy.identifier, "repos-legacy-batch");
  assert.equal(legacy.properties.next_end_of_life, "2026-11-10");
  assert.equal(legacy.properties.findings_total, 12);
});

test("a service without a deadline leaves next_end_of_life unset", () => {
  const { entities } = mapper.toPortEntities(sample);
  const checkout = entityFor(entities, "/repos/checkout");
  assert.equal("next_end_of_life" in checkout.properties, false);
});

test("entity identifiers are unique, follow Port's identifier rules, and survive path shapes", () => {
  const { entities } = mapper.toPortEntities(sample);
  const identifiers = entities.map((entity) => entity.identifier);
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) {
    assert.match(identifier, /^[\p{L}\p{N}][\p{L}\p{N}._+:/-]*$/u);
  }
  assert.equal(mapper.portIdentifier("/repos/api"), "repos-api");
  assert.equal(mapper.portIdentifier("./services/api/"), "services-api");
  assert.equal(mapper.portIdentifier("C:\\repos\\api"), "repos-api");
  assert.equal(mapper.portIdentifier("/repos/docs-site"), "repos-docs-site");
  assert.equal(mapper.serviceName("/repos/api"), "api");
  assert.equal(mapper.serviceName("C:\\repos\\api\\"), "api");
});

test("every entity property is declared on the blueprint that is shipped with the mapper", () => {
  assert.equal(mapper.PORT_BLUEPRINT, blueprint.identifier);
  assert.equal(blueprint.identifier, "evergreen-service");
  const declared = new Set(Object.keys(blueprint.schema.properties));
  const { entities } = mapper.toPortEntities(sample);
  for (const entity of entities) {
    for (const property of Object.keys(entity.properties)) {
      assert.ok(declared.has(property), `entity property "${property}" is not on the blueprint`);
    }
    for (const required of blueprint.schema.required) {
      assert.ok(required in entity.properties, `entity is missing required property "${required}"`);
    }
  }
});

test("mapping is deterministic and refuses two paths that produce the same identifier", () => {
  const forward = mapper.toPortEntities(sample);
  const backward = mapper.toPortEntities({ ...sample, services: [...sample.services].reverse() });
  assert.deepEqual(backward, forward);
  assert.throws(
    () => mapper.toPortEntities({
      schemaVersion: "evergreen.portal.v1",
      services: [
        { path: "/repos/api", severities: { info: 0, low: 0, medium: 0, high: 0, critical: 0 }, reportLink: "a.json" },
        { path: "/repos-api", severities: { info: 0, low: 0, medium: 0, high: 0, critical: 0 }, reportLink: "b.json" },
      ],
    }),
    /two scanned paths map to the Port identifier "repos-api"/,
  );
});

test("mapping refuses other schema versions and incomplete services", () => {
  assert.throws(
    () => mapper.toPortEntities({ schemaVersion: "evergreen.portal.v2", services: [] }),
    /expected a evergreen\.portal\.v1 export/,
  );
  assert.throws(
    () => mapper.toPortEntities({
      schemaVersion: "evergreen.portal.v1",
      services: [{ path: "/repos/api", reportLink: "a.json" }] as unknown as PortalService[],
    }),
    /"\/repos\/api" has no info count/,
  );
});

test("the CLI prints the same payload for the sample and exits 2 without a file", async () => {
  const { stdout } = await execute(process.execPath, [mapperPath, "integrations/port/sample-data/portal-export.json"]);
  assert.deepEqual(JSON.parse(stdout), mapper.toPortEntities(sample));
  await assert.rejects(execute(process.execPath, [mapperPath]), (error: unknown) => {
    const failure = error as { code: number; stderr: string };
    assert.equal(failure.code, 2);
    assert.match(failure.stderr, /Usage: node integrations\/port\/map\.mjs <evergreen-portal\.json>/);
    return true;
  });
});
