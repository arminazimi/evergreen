// Generates the skeleton of a new detector inside a checkout of the Evergreen repository.
//
//   evergreen new-detector go-modules [--ecosystem go]
//
// Every file is created only if none of them exists, so a run either writes the whole skeleton or nothing.

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { findCollisions } from "./collisions.js";
import { scaffoldNames, ScaffoldError } from "./names.js";
import type { ScaffoldNames } from "./names.js";
import { detectorTemplate } from "./templates/detector.js";
import { docsTemplate } from "./templates/docs.js";
import { fixturePlaceholder, fixtureReadmeTemplate } from "./templates/fixtures.js";
import { parserTemplate, parserTestTemplate } from "./templates/parser.js";
import { registryTemplate } from "./templates/registry.js";
import { testTemplate } from "./templates/test.js";

export { ScaffoldError } from "./names.js";
export { scaffoldNames } from "./names.js";

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
      `To ship the rules in the signed data bundle, add "${names.ecosystem}" to BUNDLED_ECOSYSTEMS in src/data-bundle.ts.`,
      `Add fixtures and expected findings to tests/${names.id}-detector.test.ts, then run npm run check.`,
    ],
  };
}

export function renderScaffoldResult(result: ScaffoldResult): string {
  return [`Created the ${result.names.title} detector skeleton:`, ...result.files.map((file) => `  ${file}`), "", "Next:", ...result.nextSteps.map((step, index) => `  ${index + 1}. ${step}`)].join("\n");
}
