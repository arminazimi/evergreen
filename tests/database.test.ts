import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { DatabaseDetector, databaseDetector } from "../src/detectors/database/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/database");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-database-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/database.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function rule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "database.postgresql.example",
    ecosystem: "database",
    purl: "pkg:generic/postgresql",
    vers: "vers:semver/>=12.0.0|<13.0.0",
    event: "end-of-life",
    title: "PostgreSQL 12 is end-of-life",
    summary: "PostgreSQL 12 is no longer supported.",
    severity: "high",
    replacement: "PostgreSQL 16 or later",
    sources: [{ title: "PostgreSQL versioning policy", url: "https://www.postgresql.org/support/versioning/" }],
    provenance: { observedAt: "2026-10-22", reviewedAt: "2026-10-22", reviewer: "test" },
    ...overrides,
  };
}

const MYSQL_RULE = rule({
  id: "database.mysql.example",
  purl: "pkg:generic/mysql",
  vers: "vers:semver/>=5.7.0|<5.8.0",
  title: "MySQL 5.7 is end-of-life",
});

test("database passes detector conformance on every fixture", async () => {
  const rules = await committedRules();
  const postgres = rules.find((item) => item.id === "database.postgresql.end-of-life-12")!;
  const mysql = rules.find((item) => item.id === "database.mysql.end-of-life-5.7")!;
  const azurePostgres = rules.find((item) => item.id === "database.azure-postgresql.standard-support-ended-11-to-13")!;
  const googleMysql = rules.find((item) => item.id === "database.google-cloud-sql-mysql.extended-support-5.6-to-5.7")!;
  await runDetectorConformance({
    detector: databaseDetector,
    fixtures: [
      {
        name: "database positive compose",
        root: await repository({ "compose.yaml": await readFile(resolve(fixtures, "positive/compose.yaml"), "utf8") }),
        expectedFindings: [
          expected(postgres, "compose.yaml", 3, `compose.yaml runs postgres:12. ${postgres.summary}`),
          expected(mysql, "compose.yaml", 7, `compose.yaml runs mysql:5.7. ${mysql.summary}`),
        ],
      },
      {
        name: "database positive terraform",
        root: await repository({ "main.tf": await readFile(resolve(fixtures, "positive/main.tf"), "utf8") }),
        expectedFindings: [
          expected(postgres, "main.tf", 4, `main.tf sets aws_db_instance.orders engine postgres 12.22. ${postgres.summary}`),
        ],
      },
      {
        name: "database positive azure and google cloud terraform",
        root: await repository({
          "azure.tf": 'resource "azurerm_postgresql_flexible_server" "db" {\n  version = "12"\n}\n',
          "google.tf": 'resource "google_sql_database_instance" "db" {\n  database_version = "MYSQL_5_7"\n}\n',
        }),
        expectedFindings: [
          expected(azurePostgres, "azure.tf", 2, `azure.tf sets azurerm_postgresql_flexible_server.db engine postgres 12. ${azurePostgres.summary}`),
          expected(googleMysql, "google.tf", 2, `google.tf sets google_sql_database_instance.db engine mysql 5.7. ${googleMysql.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: databaseDetector,
    fixtures: [
      { name: "database negative", root: await repository({ "compose.yaml": await readFile(resolve(fixtures, "negative/compose.yaml"), "utf8"), "main.tf": await readFile(resolve(fixtures, "negative/main.tf"), "utf8") }), expectedFindings: [] },
      { name: "database zero", root: await repository({ "compose.yaml": await readFile(resolve(fixtures, "zero/compose.yaml"), "utf8"), "main.tf": await readFile(resolve(fixtures, "zero/main.tf"), "utf8") }), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: databaseDetector,
    fixtures: [
      { name: "database malformed", root: await repository({ "compose.yaml": await readFile(resolve(fixtures, "malformed/compose.yaml"), "utf8"), "main.tf": await readFile(resolve(fixtures, "malformed/main.tf"), "utf8") }), expectedFindings: [] },
    ],
    checks: [malformedInputCheck],
  });
});

test("is registered as a built-in detector", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "database"));
});

test("reports tags and engine versions in compose.yaml, docker-compose.yml, overrides, and *.tf", async () => {
  const detector = new DatabaseDetector(async () => [rule(), MYSQL_RULE]);
  const findings = await detector.scan({
    root: await repository({
      "compose.yaml": "services:\n  db:\n    image: postgres:12\n",
      "docker-compose.yml": "services:\n  db:\n    image: postgres:12.22-alpine\n",
      "app/docker-compose.override.yml": "services:\n  db:\n    image: mysql:5.7.44\n",
      "infra/main.tf": 'resource "aws_db_instance" "a" {\n  engine = "mysql"\n  engine_version = "5.7"\n}\n',
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line, finding.ruleId]), [
    ["app/docker-compose.override.yml", 3, "database.mysql.example"],
    ["compose.yaml", 3, "database.postgresql.example"],
    ["docker-compose.yml", 3, "database.postgresql.example"],
    ["infra/main.tf", 3, "database.mysql.example"],
  ]);
  assert.match(findings[1]!.summary, /^compose\.yaml runs postgres:12\. /);
  assert.match(findings[3]!.summary, /^infra\/main\.tf sets aws_db_instance\.a engine mysql 5\.7\. /);
});

test("a tag that could mean other release lines, or carries no version, is not matched by a single-line rule", async () => {
  const detector = new DatabaseDetector(async () => [rule(), MYSQL_RULE]);
  const root = await repository({
    "compose.yaml": [
      "services:",
      "  a:\n    image: mysql:5",
      "  b:\n    image: postgres:latest",
      "  c:\n    image: postgres:alpine",
      "  d:\n    image: postgres:13",
      "  e:\n    image: postgres:12beta1",
      "  f:\n    image: postgres",
      "",
    ].join("\n"),
  });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("a product only matches rules for its own Package URL", async () => {
  const detector = new DatabaseDetector(async () => [rule()]);
  const root = await repository({ "compose.yaml": "services:\n  a:\n    image: mysql:12\n  b:\n    image: mariadb:12\n" });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("a malformed VERS rule never matches and does not hide a later rule", async () => {
  const detector = new DatabaseDetector(async () => [rule({ id: "database.bad", vers: "not-vers" }), rule()]);
  const findings = await detector.scan({ root: await repository({ "compose.yaml": "services:\n  a:\n    image: postgres:12\n" }) });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["database.postgresql.example"]);
});

test("a rule with an unreadable Package URL is skipped", async () => {
  const detector = new DatabaseDetector(async () => [rule({ purl: "not a purl" }), rule()]);
  const findings = await detector.scan({ root: await repository({ "compose.yaml": "services:\n  a:\n    image: postgres:12\n" }) });
  assert.equal(findings.length, 1);
});

test("scanRepository attributes findings to the database detector", async () => {
  const result = await scanRepository(await repository({ "compose.yaml": "services:\n  db:\n    image: postgres:12\n" }), builtInDetectors);
  assert.ok(result.findings.some((finding) => finding.detector === "database" && finding.ruleId === "database.postgresql.end-of-life-12"));
});

test("Azure and Google Cloud resources use their vendor rules, while AWS uses the upstream engine rules", async () => {
  const findings = await databaseDetector.scan({
    root: await repository({
      "main.tf": [
        'resource "azurerm_postgresql_flexible_server" "azure" {',
        '  version = "12"',
        "}",
        'resource "google_sql_database_instance" "google" {',
        '  database_version = "POSTGRES_12"',
        "}",
        'resource "aws_db_instance" "aws" {',
        '  engine         = "postgres"',
        '  engine_version = "12.22"',
        "}",
        "",
      ].join("\n"),
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.line, finding.ruleId]), [
    [2, "database.azure-postgresql.standard-support-ended-11-to-13"],
    [5, "database.google-cloud-sql-postgresql.extended-support-9.6-to-12"],
    [9, "database.postgresql.end-of-life-12"],
  ]);
});

test("variables in Azure and Google Cloud version attributes are unclassified, not findings", async () => {
  const analysis = await databaseDetector.analyze({
    root: await repository({
      "main.tf": [
        'resource "azurerm_postgresql_flexible_server" "pg" {',
        "  version = var.pg_version",
        "}",
        'resource "google_sql_database_instance" "db" {',
        "  database_version = local.database_version",
        "}",
        "",
      ].join("\n"),
    }),
  });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.component, item.reference, item.location.path, item.location.line, item.reason]),
    [
      ["azurerm_postgresql_flexible_server", "var.pg_version", "main.tf", 2, "the version on pg is not a literal string, so Evergreen does not evaluate it"],
      ["google_sql_database_instance", "local.database_version", "main.tf", 5, "the database_version on db is not a literal string, so Evergreen does not evaluate it"],
    ],
  );
});

test("ignores vendored directories, fixture directories, and a repository without Compose or Terraform files", async () => {
  assert.deepEqual(await databaseDetector.scan({ root: await repository({ "README.md": "hello\n" }) }), []);
  assert.deepEqual(
    await databaseDetector.scan({
      root: await repository({
        "node_modules/x/compose.yaml": "services:\n  a:\n    image: postgres:12\n",
        ".terraform/modules/x/main.tf": 'resource "aws_db_instance" "a" {\n  engine = "postgres"\n  engine_version = "12.22"\n}\n',
        "tests/fixtures/compose.yaml": "services:\n  a:\n    image: postgres:12\n",
      }),
    }),
    [],
  );
});

test("every curated database rule has migration guidance with real verification commands", async () => {
  for (const item of await committedRules()) {
    assert.ok(item.migration && item.migration.constraints.length >= 1 && item.migration.steps.length >= 1, item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "docker compose config"), item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "terraform plan"), item.id);
  }
});

test("a migration packet for a Compose finding names the file, steps, and verification", async () => {
  const result = await scanRepository(await repository({ "compose.yaml": "services:\n  db:\n    image: postgres:12\n" }), [databaseDetector]);
  const finding = result.findings.find((item) => item.id === "database.postgresql.end-of-life-12:compose.yaml:3");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("compose.yaml"));
  assert.deepEqual(
    packet.steps.map((step) => step.id).filter((id) => !["review-evidence", "verify-migration"].includes(id)),
    ["back-up-data", "upgrade-data", "raise-declared-version", "align-clients"],
  );
  assert.ok(packet.verification.some((check) => check.command === "docker compose config"));
});

test("a scheduled PostgreSQL line is reported at low severity, for the tag that names it and not for a newer one", async () => {
  const rule = (await committedRules()).find((item) => item.id === "database.postgresql.end-of-life-14")!;
  assert.equal(rule.event, "scheduled-end-of-life");
  const root = await repository({
    "compose.yaml": "services:\n  a:\n    image: postgres:14\n  b:\n    image: postgres:14.5-alpine\n  c:\n    image: postgres:15\n  d:\n    image: postgres:latest\n",
  });
  const findings = (await databaseDetector.scan({ root })).filter((finding) => finding.ruleId === rule.id);
  assert.deepEqual(findings.map((finding) => [finding.location.line, finding.severity, finding.deadline]), [[3, "low", "2026-11-12"], [5, "low", "2026-11-12"]]);
});
