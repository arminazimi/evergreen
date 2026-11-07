// Generates and validates the CycloneDX VEX file attached to every release.
//
//   node release-vex.mjs generate --sbom sbom.cdx.json --statements security/vex --output vex.cdx.json
//   node release-vex.mjs check vex.cdx.json --sbom sbom.cdx.json --statements security/vex
//
// A VEX statement says that a known vulnerability in a shipped dependency does not affect Evergreen,
// and why. Statements are reviewed files, one per advisory and package, under security/vex/. `generate`
// keeps the statements whose package (and version, when the statement names versions) is a component
// of this release's SBOM and writes them as CycloneDX 1.5 `vulnerabilities`, each pointing at the
// SBOM component with a BOM-Link. `check` validates the document against the CycloneDX 1.5 JSON
// schema and the release invariants: it names this release, and every statement resolves to a
// component of the SBOM and carries a state, a justification, and a reason.
//
// It reads local files only. It makes no network calls and never executes repository code.

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SPEC_VERSION, purlFor, schemaProblems } from "./release-sbom.mjs";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The CycloneDX 1.5 `impactAnalysisJustification` values a not-affected statement may use. */
export const JUSTIFICATIONS = [
  "code_not_present",
  "code_not_reachable",
  "requires_configuration",
  "requires_dependency",
  "requires_environment",
  "protected_by_compiler",
  "protected_at_runtime",
  "protected_at_perimeter",
  "protected_by_mitigating_control",
];

const asciiCompare = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Everything wrong with one statement file's content. An empty array means it is well formed. */
export function statementProblems(statement) {
  const problems = [];
  if (
    typeof statement !== "object" ||
    statement === null ||
    Array.isArray(statement)
  )
    return ["must be an object"];
  if (
    typeof statement.id !== "string" ||
    !/^(GHSA-[\w-]+|CVE-\d{4}-\d{4,}|OSV-[\w-]+)$/.test(statement.id)
  ) {
    problems.push("id must be a GHSA, CVE, or OSV identifier");
  }
  if (typeof statement.package !== "string" || statement.package === "")
    problems.push("package must be an npm package name");
  if (
    statement.versions !== undefined &&
    (!Array.isArray(statement.versions) ||
      statement.versions.length === 0 ||
      !statement.versions.every((v) => typeof v === "string" && v !== ""))
  ) {
    problems.push(
      "versions, when present, must be a non-empty list of exact versions",
    );
  }
  if (statement.state !== "not_affected")
    problems.push("state must be not_affected");
  if (!JUSTIFICATIONS.includes(statement.justification)) {
    problems.push(`justification must be one of ${JUSTIFICATIONS.join(", ")}`);
  }
  if (
    typeof statement.detail !== "string" ||
    statement.detail.trim().length < 20
  ) {
    problems.push(
      "detail must explain, in at least 20 characters, why Evergreen is not affected",
    );
  }
  const url = statement.source?.url;
  if (
    statement.source !== undefined &&
    (typeof url !== "string" ||
      !URL.canParse(url) ||
      !url.startsWith("https://"))
  ) {
    problems.push("source.url, when present, must be an https URL");
  }
  const known = new Set([
    "id",
    "package",
    "versions",
    "state",
    "justification",
    "detail",
    "source",
  ]);
  for (const key of Object.keys(statement))
    if (!known.has(key)) problems.push(`unknown field ${key}`);
  return problems;
}

/** Reads every statement file in `directory`; throws with all problems when any file is malformed. */
export function readStatements(directory) {
  const statements = [];
  const failures = [];
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort(asciiCompare);
  for (const file of files) {
    let statement;
    try {
      statement = JSON.parse(readFileSync(join(directory, file), "utf8"));
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
      continue;
    }
    const problems = statementProblems(statement);
    for (const problem of problems) failures.push(`${file}: ${problem}`);
    if (problems.length === 0) statements.push(statement);
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return statements;
}

/** The SBOM components a statement applies to. */
export function matchingComponents(statement, sbom) {
  return (sbom.components ?? []).filter(
    (component) =>
      component.name === statement.package &&
      (statement.versions === undefined ||
        statement.versions.includes(component.version)),
  );
}

function bomLink(sbom, ref) {
  return `urn:cdx:${sbom.serialNumber.replace(/^urn:uuid:/, "")}/${sbom.version}#${encodeURIComponent(ref)}`;
}

/** The CycloneDX VEX document for the release described by `sbom`. */
export function buildVex(sbom, statements, serialNumber = randomUUID()) {
  const vulnerabilities = [];
  for (const statement of statements) {
    const components = matchingComponents(statement, sbom);
    if (components.length === 0) continue;
    vulnerabilities.push({
      "bom-ref": `vex:${statement.id}:${statement.package}`,
      id: statement.id,
      ...(statement.source === undefined
        ? {}
        : {
            source: {
              name: statement.source.name ?? statement.id,
              url: statement.source.url,
            },
          }),
      analysis: {
        state: statement.state,
        justification: statement.justification,
        detail: statement.detail,
      },
      affects: components
        .map((component) => ({ ref: bomLink(sbom, component["bom-ref"]) }))
        .sort((a, b) => asciiCompare(a.ref, b.ref)),
    });
  }
  vulnerabilities.sort((left, right) =>
    asciiCompare(left["bom-ref"], right["bom-ref"]),
  );
  return {
    bomFormat: "CycloneDX",
    specVersion: SPEC_VERSION,
    serialNumber: `urn:uuid:${serialNumber}`,
    version: 1,
    metadata: { component: sbom.metadata.component },
    vulnerabilities,
  };
}

/** Everything that would make `document` a wrong VEX file for `sbom` and `statements`. */
export function vexProblems(document, sbom, statements) {
  const problems = [];
  if (document?.bomFormat !== "CycloneDX")
    problems.push("bomFormat must be CycloneDX");
  if (document?.specVersion !== SPEC_VERSION)
    problems.push(`specVersion must be ${SPEC_VERSION}`);
  if (
    !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      document?.serialNumber ?? "",
    )
  ) {
    problems.push("serialNumber must be a urn:uuid identifier");
  }
  const rootRef = purlFor(
    sbom.metadata.component.name,
    sbom.metadata.component.version,
  );
  if (document?.metadata?.component?.["bom-ref"] !== rootRef)
    problems.push(`metadata.component bom-ref must be ${rootRef}`);
  if (!Array.isArray(document?.vulnerabilities)) {
    problems.push("vulnerabilities must be an array");
    return problems;
  }
  const links = new Set(
    (sbom.components ?? []).map((component) =>
      bomLink(sbom, component["bom-ref"]),
    ),
  );
  const seen = new Set();
  for (const vulnerability of document.vulnerabilities) {
    const id = vulnerability?.["bom-ref"] ?? vulnerability?.id ?? "(unnamed)";
    if (seen.has(id)) problems.push(`duplicate statement ${id}`);
    seen.add(id);
    if (vulnerability?.analysis?.state !== "not_affected")
      problems.push(`${id} must be not_affected`);
    if (!JUSTIFICATIONS.includes(vulnerability?.analysis?.justification))
      problems.push(`${id} needs a justification`);
    if (
      typeof vulnerability?.analysis?.detail !== "string" ||
      vulnerability.analysis.detail === ""
    )
      problems.push(`${id} needs a reason`);
    if (
      !Array.isArray(vulnerability?.affects) ||
      vulnerability.affects.length === 0
    )
      problems.push(`${id} must affect a component`);
    for (const affected of vulnerability?.affects ?? []) {
      if (!links.has(affected.ref))
        problems.push(
          `${id} affects ${affected.ref}, which is not a component of the SBOM`,
        );
    }
  }
  const expected = new Set(
    statements
      .filter((s) => matchingComponents(s, sbom).length > 0)
      .map((s) => `vex:${s.id}:${s.package}`),
  );
  for (const ref of expected)
    if (!seen.has(ref)) problems.push(`statement ${ref} is missing`);
  for (const ref of seen)
    if (!expected.has(ref))
      problems.push(`statement ${ref} is not in security/vex`);
  return problems;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(args) {
  const [command] = args;
  try {
    const sbomPath = option(args, "--sbom");
    const statementsPath =
      option(args, "--statements") ?? join(REPOSITORY_ROOT, "security", "vex");
    if (sbomPath === undefined)
      throw new Error("--sbom <sbom.cdx.json> is required");
    const sbom = readJson(sbomPath);
    const statements = readStatements(statementsPath);
    if (command === "generate") {
      const outputPath = option(args, "--output");
      if (outputPath === undefined)
        throw new Error(
          "Usage: release-vex.mjs generate --sbom <sbom> --statements <dir> --output <vex.cdx.json>",
        );
      const document = buildVex(sbom, statements);
      writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
      console.log(
        `Wrote ${outputPath}: ${document.vulnerabilities.length} statements for ${sbom.metadata.component.name}@${sbom.metadata.component.version}.`,
      );
      return 0;
    }
    if (command === "check") {
      const path = args[1];
      if (path === undefined)
        throw new Error(
          "Usage: release-vex.mjs check <vex.cdx.json> --sbom <sbom> [--statements <dir>]",
        );
      const document = readJson(path);
      const problems = [
        ...vexProblems(document, sbom, statements),
        ...schemaProblems(document),
      ];
      if (problems.length > 0) {
        for (const problem of problems) console.error(`- ${problem}`);
        return 1;
      }
      console.log(
        `Valid CycloneDX ${SPEC_VERSION} VEX file: ${document.vulnerabilities.length} statements.`,
      );
      return 0;
    }
    throw new Error(`Unknown command: ${command ?? "(none)"}`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2));
}
