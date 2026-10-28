import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const smoke = resolve("tests/fixtures/smoke");
const baseline = resolve("tests/fixtures/baselines/v0.1.0.json");

async function runCli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

async function loadSchema(name: string): Promise<object> {
  return JSON.parse(await readFile(resolve(`schemas/${name}`), "utf8")) as object;
}

function createValidator(schema: object, extraSchemas: object[] = []) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const extra of extraSchemas) {
    ajv.addSchema(extra);
  }
  return ajv.compile(schema);
}

function assertAdditionalPropertiesRejected(
  validate: ReturnType<typeof createValidator>,
  validDocument: Record<string, unknown>,
  mutator?: (doc: Record<string, unknown>) => Record<string, unknown>,
) {
  const mutated = mutator
    ? mutator(JSON.parse(JSON.stringify(validDocument)))
    : { ...validDocument, undeclaredSnapProperty: "disallowed" };
  const isValid = validate(mutated);
  assert.equal(isValid, false, "Schema must reject document containing undeclared property");
  assert.ok(
    validate.errors?.some((err) => err.keyword === "additionalProperties"),
    `Expected additionalProperties error, got: ${JSON.stringify(validate.errors)}`,
  );
}

test("scan --json matches scan.v1.schema.json and rejects undeclared properties", async () => {
  const scanSchema = await loadSchema("scan.v1.schema.json");
  const validate = createValidator(scanSchema);

  const { stdout } = await runCli("scan", smoke, "--json");
  const parsed = JSON.parse(stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.scan.v1");
  assert.ok(Array.isArray(parsed.findings) && parsed.findings.length > 0);

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);

  // Nested finding undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.findings as Array<Record<string, unknown>>)[0]!.undeclaredFindingProperty = "disallowed";
    return doc;
  });

  // Scan with baseline (populates suppressions) also matches
  const { stdout: baselineStdout } = await runCli("scan", smoke, "--baseline", baseline, "--json");
  const baselineParsed = JSON.parse(baselineStdout);
  assert.equal(validate(baselineParsed), true, JSON.stringify(validate.errors));
  assert.ok(baselineParsed.suppressions);

  // Nested suppressions undeclared property rejected
  assertAdditionalPropertiesRejected(validate, baselineParsed, (doc) => {
    (doc.suppressions as Record<string, unknown>).undeclaredSuppressionProperty = "disallowed";
    return doc;
  });
});

test("check --json matches check.v1.schema.json and rejects undeclared properties", async () => {
  const scanSchema = await loadSchema("scan.v1.schema.json");
  const checkSchema = await loadSchema("check.v1.schema.json");
  const validate = createValidator(checkSchema, [scanSchema]);

  // Affected package check (exits 1)
  const result = await runCli("check", "pkg:npm/request", "--json");
  assert.equal(result.code, 1);
  const parsed = JSON.parse(result.stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.check.v1");
  assert.equal(parsed.status, "affected");

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);

  // Nested finding undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.findings as Array<Record<string, unknown>>)[0]!.undeclaredFindingProperty = "disallowed";
    return doc;
  });

  // Non-affected package check (exits 0)
  const okResult = await runCli("check", "pkg:npm/express", "--json");
  assert.equal(okResult.code, 0);
  const okParsed = JSON.parse(okResult.stdout);
  assert.equal(validate(okParsed), true, JSON.stringify(validate.errors));
  assert.equal(okParsed.schemaVersion, "evergreen.check.v1");
});

test("explain --json matches finding.v1.schema.json and rejects undeclared properties", async () => {
  const findingSchema = await loadSchema("finding.v1.schema.json");
  const validate = createValidator(findingSchema);

  // First retrieve a finding id from a scan
  const { stdout: scanStdout } = await runCli("scan", smoke, "--json");
  const scanData = JSON.parse(scanStdout);
  const findingId = scanData.findings[0]!.id as string;

  const { stdout } = await runCli("explain", findingId, smoke, "--json");
  const parsed = JSON.parse(stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.id, findingId);

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);

  // Nested location undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.location as Record<string, unknown>).undeclaredLocationProperty = "disallowed";
    return doc;
  });
});

test("context --json matches context.v1.schema.json and rejects undeclared properties", async () => {
  const scanSchema = await loadSchema("scan.v1.schema.json");
  const contextSchema = await loadSchema("context.v1.schema.json");
  const validate = createValidator(contextSchema, [scanSchema]);

  const { stdout: scanStdout } = await runCli("scan", smoke, "--json");
  const scanData = JSON.parse(scanStdout);
  const findingId = scanData.findings[0]!.id as string;

  const { stdout } = await runCli("context", findingId, smoke, "--json");
  const parsed = JSON.parse(stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.context.v1");

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);

  // Nested step undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.steps as Array<Record<string, unknown>>)[0]!.undeclaredStepProperty = "disallowed";
    return doc;
  });

  // Nested verification command undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.verification as Array<Record<string, unknown>>)[0]!.undeclaredVerificationProperty = "disallowed";
    return doc;
  });
});

test("doctor --json matches doctor.v1.schema.json and rejects undeclared properties", async () => {
  const doctorSchema = await loadSchema("doctor.v1.schema.json");
  const validate = createValidator(doctorSchema);

  const { stdout } = await runCli("doctor", "--json");
  const parsed = JSON.parse(stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.doctor.v1");

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);

  // Nested check undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed, (doc) => {
    (doc.checks as Array<Record<string, unknown>>)[0]!.undeclaredCheckProperty = "disallowed";
    return doc;
  });

  // Doctor with --system matches doctor schema
  const { stdout: systemStdout } = await runCli("doctor", "--system", "--json");
  const systemParsed = JSON.parse(systemStdout);
  assert.equal(validate(systemParsed), true, JSON.stringify(validate.errors));
  assert.ok(Array.isArray(systemParsed.system));

  // Nested system tool check undeclared property rejected
  if (systemParsed.system.length > 0) {
    assertAdditionalPropertiesRejected(validate, systemParsed, (doc) => {
      (doc.system as Array<Record<string, unknown>>)[0]!.undeclaredSystemProperty = "disallowed";
      return doc;
    });
  }
});

test("data status --json matches data-status.v1.schema.json and rejects undeclared properties", async () => {
  const dataStatusSchema = await loadSchema("data-status.v1.schema.json");
  const validate = createValidator(dataStatusSchema);

  const { stdout } = await runCli("data", "status", "--json");
  const parsed = JSON.parse(stdout);

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.data-status.v1");

  // Top-level undeclared property rejected
  assertAdditionalPropertiesRejected(validate, parsed);
});
