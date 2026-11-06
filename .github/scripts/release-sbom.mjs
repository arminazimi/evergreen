// Generates and validates the CycloneDX SBOM attached to every release.
//
//   node release-sbom.mjs generate --tree npm-tree.json --output sbom.cdx.json
//   node release-sbom.mjs check sbom.cdx.json --tree npm-tree.json
//
// `generate` reads the production dependency tree (`npm ls --omit=dev --all --json`, written by the
// workflow) plus package.json, and writes a CycloneDX 1.5 JSON document. `check` validates that
// document against the CycloneDX 1.5 JSON schema kept in tests/fixtures/cyclonedx and against the
// release invariants: the root is this package, every runtime dependency is present, and the
// dependency graph matches the installed tree.
//
// It reads local files only. It makes no network calls and never executes repository code.
//
// Why not `npm sbom`: its `--omit=dev` selector drops every package that is also reachable from a
// development dependency (semver, yaml, zod, and smol-toml in this repository) and it fails after
// `npm ci --omit=dev`, so it cannot describe what the published package installs.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Ajv } from "ajv";

export const SPEC_VERSION = "1.5";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_DIRECTORY = join(REPOSITORY_ROOT, "tests", "fixtures", "cyclonedx");

const asciiCompare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/** A Package URL for an npm package, with the `@` of a scope encoded the way npm writes it. */
export function purlFor(name, version) {
  return `pkg:npm/${name.startsWith("@") ? `%40${name.slice(1)}` : name}@${version}`;
}

/**
 * Every package the published tarball installs, keyed by the CycloneDX `bom-ref` that is also its
 * purl. The npm tree nests a second copy of a package under the parent that resolved it, so the same
 * name and version can appear more than once; components and dependency edges are deduplicated.
 */
export function collectProductionTree(tree) {
  const components = new Map();
  const dependencies = new Map();

  const visit = (name, node) => {
    const ref = purlFor(name, node.version);
    if (!components.has(ref)) {
      components.set(ref, {
        "bom-ref": ref,
        type: "library",
        name,
        version: node.version,
        purl: ref,
        scope: "required",
      });
    }
    const dependsOn = dependencies.get(ref) ?? new Set();
    dependencies.set(ref, dependsOn);
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      dependsOn.add(purlFor(childName, child.version));
      visit(childName, child);
    }
  };

  for (const [name, node] of Object.entries(tree.dependencies ?? {})) visit(name, node);

  return {
    components: [...components.values()].sort((left, right) => asciiCompare(left["bom-ref"], right["bom-ref"])),
    dependencies: new Map(
      [...dependencies.entries()]
        .sort(([left], [right]) => asciiCompare(left, right))
        .map(([ref, dependsOn]) => [ref, [...dependsOn].sort(asciiCompare)]),
    ),
  };
}

/** The CycloneDX document for one release of `pkg` built from its production dependency `tree`. */
export function buildSbom(pkg, tree, serialNumber = randomUUID()) {
  const { components, dependencies } = collectProductionTree(tree);
  const rootRef = purlFor(pkg.name, pkg.version);

  return {
    bomFormat: "CycloneDX",
    specVersion: SPEC_VERSION,
    serialNumber: `urn:uuid:${serialNumber}`,
    version: 1,
    metadata: {
      component: {
        "bom-ref": rootRef,
        type: "application",
        name: pkg.name,
        version: pkg.version,
        purl: rootRef,
      },
    },
    components,
    dependencies: [
      { ref: rootRef, dependsOn: directRefs(tree) },
      ...components.map((component) => ({ ref: component["bom-ref"], dependsOn: dependencies.get(component["bom-ref"]) ?? [] })),
    ],
  };
}

function componentName(ref) {
  const match = /^pkg:npm\/(.+)@([^@]+)$/.exec(ref);
  return match === null ? ref : match[1].replace(/^%40/, "@");
}

function directRefs(tree) {
  return Object.entries(tree.dependencies ?? {})
    .map(([name, node]) => purlFor(name, node.version))
    .sort(asciiCompare);
}

/**
 * Everything about `document` that would make it a wrong SBOM for `pkg` and `tree`. An empty array
 * means it names this release, lists exactly the production dependencies, and carries their edges.
 */
export function sbomProblems(document, pkg, tree) {
  const problems = [];
  const rootRef = purlFor(pkg.name, pkg.version);

  if (document?.bomFormat !== "CycloneDX") problems.push("bomFormat must be CycloneDX");
  if (document?.specVersion !== SPEC_VERSION) problems.push(`specVersion must be ${SPEC_VERSION}`);
  if (!Number.isInteger(document?.version) || document.version < 1) problems.push("version must be a positive integer");
  if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(document?.serialNumber ?? "")) {
    problems.push("serialNumber must be a urn:uuid identifier");
  }

  const root = document?.metadata?.component;
  if (root?.["bom-ref"] !== rootRef) problems.push(`metadata.component bom-ref must be ${rootRef}`);
  if (root?.name !== pkg.name) problems.push(`metadata.component name must be ${pkg.name}`);
  if (root?.version !== pkg.version) problems.push(`metadata.component version must be ${pkg.version}`);

  if (!Array.isArray(document?.components)) {
    problems.push("components must be an array");
    return problems;
  }

  const refs = new Set();
  for (const component of document.components) {
    const ref = component?.["bom-ref"];
    if (typeof ref !== "string" || ref === "") {
      problems.push("every component needs a bom-ref");
      continue;
    }
    if (refs.has(ref)) problems.push(`duplicate component ${ref}`);
    refs.add(ref);
    if (component.purl !== ref) problems.push(`component ${ref} must carry its bom-ref as its purl`);
    if (component.type !== "library") problems.push(`component ${ref} must be a library`);
    if (typeof component.name !== "string" || typeof component.version !== "string") {
      problems.push(`component ${ref} needs a name and a version`);
    }
  }

  const declared = Object.keys(pkg.dependencies ?? {});
  for (const name of declared) {
    if (![...refs].some((ref) => componentName(ref) === name)) problems.push(`runtime dependency ${name} is missing`);
  }

  const expected = tree === undefined ? undefined : collectProductionTree(tree);
  if (expected !== undefined) {
    const expectedRefs = new Set(expected.components.map((component) => component["bom-ref"]));
    for (const ref of expectedRefs) if (!refs.has(ref)) problems.push(`component ${ref} is missing`);
    for (const ref of refs) if (!expectedRefs.has(ref) && !declared.includes(componentName(ref))) {
      problems.push(`component ${ref} is not a production dependency`);
    }
  }

  if (!Array.isArray(document.dependencies)) {
    problems.push("dependencies must be an array");
    return problems;
  }
  const edges = new Map();
  for (const entry of document.dependencies) {
    if (typeof entry?.ref !== "string") {
      problems.push("every dependency entry needs a ref");
      continue;
    }
    if (entry.ref !== rootRef && !refs.has(entry.ref)) problems.push(`dependency entry ${entry.ref} has no component`);
    edges.set(entry.ref, [...(entry.dependsOn ?? [])]);
  }
  if (!edges.has(rootRef)) problems.push(`dependencies must describe the root ${rootRef}`);
  for (const dependsOn of edges.get(rootRef) ?? []) {
    if (!refs.has(dependsOn)) problems.push(`root depends on ${dependsOn}, which is not a component`);
  }
  for (const ref of refs) {
    if (!edges.has(ref)) problems.push(`component ${ref} is missing from dependencies`);
  }
  if (expected !== undefined) {
    for (const [ref, dependsOn] of expected.dependencies) {
      const actual = new Set(edges.get(ref) ?? []);
      for (const child of dependsOn) if (!actual.has(child)) problems.push(`${ref} must depend on ${child}`);
      for (const child of actual) if (!dependsOn.includes(child)) problems.push(`${ref} must not depend on ${child}`);
    }
    for (const ref of edges.get(rootRef) ?? []) {
      if (!expected.components.some((component) => component["bom-ref"] === ref)) {
        problems.push(`root must not depend on ${ref}`);
      }
    }
  }

  return problems;
}

/** Schema violations of `document` against the bundled CycloneDX 1.5 JSON schema. */
export function schemaProblems(document) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("iri-reference", (value) => !/\s/.test(value));
  ajv.addFormat("uri", (value) => URL.canParse(value));
  ajv.addFormat(
    "date-time",
    (value) =>
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)),
  );
  ajv.addFormat("idn-email", (value) => /^[^\s@]+@[^\s@]+$/.test(value));
  for (const file of ["spdx.schema.json", "jsf-0.82.schema.json"]) {
    ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, file), "utf8")));
  }
  const validate = ajv.compile(JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, "bom-1.5.schema.json"), "utf8")));
  return validate(document) ? [] : (validate.errors ?? []).map((error) => `schema ${error.instancePath || "/"} ${error.message}`);
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
    const pkg = readJson(join(REPOSITORY_ROOT, "package.json"));
    if (command === "generate") {
      const treePath = option(args, "--tree");
      const outputPath = option(args, "--output");
      if (treePath === undefined || outputPath === undefined) {
        throw new Error("Usage: release-sbom.mjs generate --tree <npm-ls.json> --output <sbom.cdx.json>");
      }
      const document = buildSbom(pkg, readJson(treePath));
      writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
      console.log(`Wrote ${outputPath}: ${document.components.length} components for ${pkg.name}@${pkg.version}.`);
      return 0;
    }
    if (command === "check") {
      const path = args[1];
      if (path === undefined) throw new Error("Usage: release-sbom.mjs check <sbom.cdx.json> [--tree <npm-ls.json>]");
      const treePath = option(args, "--tree");
      const document = readJson(path);
      const problems = [
        ...sbomProblems(document, pkg, treePath === undefined ? undefined : readJson(treePath)),
        ...schemaProblems(document),
      ];
      if (problems.length > 0) {
        for (const problem of problems) console.error(`- ${problem}`);
        return 1;
      }
      console.log(`Valid CycloneDX ${SPEC_VERSION} SBOM for ${pkg.name}@${pkg.version}: ${document.components.length} components.`);
      return 0;
    }
    throw new Error(`Unknown command: ${command ?? "(none)"}`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
