// Generates the skeleton of a new detector inside a checkout of the Evergreen repository.
//
//   evergreen new-detector go-modules [--ecosystem go]
//
// Every file is created only if none of them exists, so a run either writes the whole skeleton or nothing.

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { findCollisions } from "./collisions.js";
import { ruleScaffoldNames, scaffoldNames, ScaffoldError } from "./names.js";
import type { RuleScaffoldNames, ScaffoldNames } from "./names.js";
import { detectorTemplate } from "./templates/detector.js";
import { docsTemplate } from "./templates/docs.js";
import { fixturePlaceholder, fixtureReadmeTemplate } from "./templates/fixtures.js";
import { parserTemplate, parserTestTemplate } from "./templates/parser.js";
import { registryTemplate } from "./templates/registry.js";
import { cleanFixtureTemplate, matchFixtureTemplate, ruleFixtureReadmeTemplate, ruleTemplate } from "./templates/rule.js";
import { testTemplate } from "./templates/test.js";

export { ScaffoldError } from "./names.js";
export { ruleScaffoldNames, scaffoldNames } from "./names.js";

export interface ScaffoldOptions {
  /** Repository root; defaults to the current directory. */
  root?: string;
  /** Registry ecosystem slug; defaults to the detector id. */
  ecosystem?: string;
}

export interface ScaffoldResult {
  names: ScaffoldNames;
  /** Repository-relative paths, in the order they were written. */
  files: string[];
  /** What the author still has to do by hand. */
  nextSteps: string[];
}

/** The files of the skeleton, as repository-relative path and contents. Pure: nothing is read or written. */
export function renderScaffold(names: ScaffoldNames): Map<string, string> {
  return new Map([
    [`src/detectors/${names.id}.ts`, detectorTemplate(names)],
    [`src/detectors/${names.id}/parse.ts`, parserTemplate(names)],
    [`registry/${names.id}.json`, registryTemplate(names)],
    [`tests/${names.id}-detector.test.ts`, testTemplate(names)],
    [`tests/${names.id}-parse.test.ts`, parserTestTemplate(names)],
    [`tests/fixtures/${names.id}/README.md`, fixtureReadmeTemplate(names)],
    [`tests/fixtures/${names.id}/zero/README.md`, fixturePlaceholder(names, "zero")],
    [`tests/fixtures/${names.id}/malformed/README.md`, fixturePlaceholder(names, "malformed")],
    [`docs/detectors/${names.id}.md`, docsTemplate(names)],
  ]);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertEvergreenCheckout(root: string): Promise<void> {
  const manifest = await readFile(join(root, "package.json"), "utf8").catch(() => undefined);
  const name = manifest === undefined ? undefined : (JSON.parse(manifest) as { name?: string }).name;
  if (name !== "evergreen-deprecation" || !(await exists(join(root, "src", "detectors", "index.ts")))) {
    throw new ScaffoldError("new-detector creates files in a checkout of the Evergreen repository. Run it from the repository root.");
  }
}

export async function scaffoldDetector(id: string, options: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  const root = options.root ?? process.cwd();
  const names = scaffoldNames(id, options.ecosystem);
  await assertEvergreenCheckout(root);

  const collisions = await findCollisions(root, names);
  if (collisions.length > 0) {
    throw new ScaffoldError(`Nothing was written: ${collisions.join("; ")}.`);
  }

  const files = renderScaffold(names);
  const existing: string[] = [];
  for (const path of files.keys()) if (await exists(join(root, path))) existing.push(path);
  if (existing.length > 0) {
    throw new ScaffoldError(`Nothing was written: ${existing.join(", ")} already ${existing.length === 1 ? "exists" : "exist"}.`);
  }

  for (const [path, contents] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents, { flag: "wx" });
  }
  return {
    names,
    files: [...files.keys()],
    nextSteps: [
      `Register the detector: in src/detectors/index.ts import { ${names.camel}Detector } from "./${names.id}.js" and add it to builtInDetectors.`,
      `Teach src/detectors/${names.id}/parse.ts to read the declarations, match them in src/detectors/${names.id}.ts, and write the rules in registry/${names.id}.json (docs/RULES.md).`,
      `Add each rule with evergreen new-rule <${names.ecosystem}>.<component>.<event>, then follow its next steps.`,
      `To ship the rules in the signed data bundle, add "${names.ecosystem}" to BUNDLED_ECOSYSTEMS in src/data-bundle.ts.`,
      `Add fixtures and expected findings to tests/${names.id}-detector.test.ts, then run npm run check.`,
    ],
  };
}

export interface RuleScaffoldOptions {
  /** Repository root; defaults to the current directory. */
  root?: string;
  /** Registry ecosystem; defaults to the first segment of the rule id. */
  ecosystem?: string;
  /** Review date for the placeholder provenance, as YYYY-MM-DD; defaults to today. */
  today?: string;
}

export interface RuleScaffoldResult {
  names: RuleScaffoldNames;
  /** Repository-relative path of the registry the rule was added to. */
  registry: string;
  /** Repository-relative paths, in the order they were written. */
  files: string[];
  /** What the author still has to do by hand. */
  nextSteps: string[];
}

const RULE_FIXTURES = (names: RuleScaffoldNames) => `tests/fixtures/${names.id}`;

/** The fixture files of a rule, as repository-relative path and contents. Pure: nothing is read or written. */
export function renderRuleScaffold(names: RuleScaffoldNames, today: string): Map<string, string> {
  const root = RULE_FIXTURES(names);
  return new Map([
    [`${root}/match/index.js`, matchFixtureTemplate(names)],
    [`${root}/match/README.md`, ruleFixtureReadmeTemplate(names, "match")],
    [`${root}/clean/index.js`, cleanFixtureTemplate(names)],
    [`${root}/clean/README.md`, ruleFixtureReadmeTemplate(names, "clean")],
  ]);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Adds the rule to a registry document, keeping the existing formatting. */
export function registryWithRule(contents: string, rule: Record<string, unknown>): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new ScaffoldError(`the registry is not valid JSON (${(error as Error).message})`);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.rules)) {
    throw new ScaffoldError("the registry is not an evergreen.registry.v2 document: rules is not an array");
  }
  parsed.rules.push(rule);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/** Rule id -> the registry file that defines it. */
async function existingRuleIds(root: string): Promise<Map<string, string>> {
  const directory = join(root, "registry");
  const ids = new Map<string, string>();
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "sources.lock.json" || entry.name.endsWith("-shas.json")) continue;
    const file = `registry/${entry.name}`;
    let value: unknown;
    try {
      value = JSON.parse(await readFile(join(directory, entry.name), "utf8"));
    } catch {
      continue;
    }
    const rules = isRecord(value) && Array.isArray(value.rules) ? value.rules : [];
    for (const rule of rules) {
      if (isRecord(rule) && typeof rule.id === "string" && !ids.has(rule.id)) ids.set(rule.id, file);
    }
  }
  return ids;
}

async function assertRuleCheckout(root: string): Promise<void> {
  const manifest = await readFile(join(root, "package.json"), "utf8").catch(() => undefined);
  const name = manifest === undefined ? undefined : (JSON.parse(manifest) as { name?: string }).name;
  if (name !== "evergreen-deprecation" || !(await exists(join(root, "registry")))) {
    throw new ScaffoldError("new-rule creates a rule in a checkout of the Evergreen repository. Run it from the repository root.");
  }
}

export async function scaffoldRule(id: string, options: RuleScaffoldOptions = {}): Promise<RuleScaffoldResult> {
  const root = options.root ?? process.cwd();
  const names = ruleScaffoldNames(id, options.ecosystem);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  await assertRuleCheckout(root);

  const registry = `registry/${names.ecosystem}.json`;
  if (!(await exists(join(root, registry)))) {
    throw new ScaffoldError(`Nothing was written: ${registry} does not exist. Create the ecosystem first with evergreen new-detector ${names.ecosystem}, or pass --ecosystem with a registry that exists.`);
  }
  const owner = (await existingRuleIds(root)).get(names.id);
  if (owner !== undefined) {
    throw new ScaffoldError(`Nothing was written: the rule id "${names.id}" is already defined in ${owner}.`);
  }

  const files = renderRuleScaffold(names, today);
  const existing: string[] = [];
  if (await exists(join(root, RULE_FIXTURES(names)))) existing.push(`${RULE_FIXTURES(names)}/`);
  for (const path of files.keys()) if (await exists(join(root, path))) existing.push(path);
  if (existing.length > 0) {
    throw new ScaffoldError(`Nothing was written: ${existing.join(", ")} already ${existing.length === 1 ? "exists" : "exist"}.`);
  }

  const updated = registryWithRule(await readFile(join(root, registry), "utf8"), ruleTemplate(names, today));
  for (const [path, contents] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents, { flag: "wx" });
  }
  await writeFile(join(root, registry), updated);
  return {
    names,
    registry,
    files: [registry, ...files.keys()],
    nextSteps: [
      `Replace the placeholder sources, purl, vers, title, summary, replacement, and provenance in ${registry} with the claim and evidence (docs/RULES.md).`,
      `Put the smallest repository the rule must report in ${RULE_FIXTURES(names)}/match, and a lookalike in clean.`,
      `Run evergreen rules lint and evergreen rules test ${names.id}, then npm run check.`,
    ],
  };
}

export function renderRuleScaffoldResult(result: RuleScaffoldResult): string {
  return [`Created the ${result.names.id} rule in ${result.registry}:`, ...result.files.map((file) => `  ${file}`), "", "Next:", ...result.nextSteps.map((step, index) => `  ${index + 1}. ${step}`)].join("\n");
}

export function renderScaffoldResult(result: ScaffoldResult): string {
  return [`Created the ${result.names.title} detector skeleton:`, ...result.files.map((file) => `  ${file}`), "", "Next:", ...result.nextSteps.map((step, index) => `  ${index + 1}. ${step}`)].join("\n");
}
