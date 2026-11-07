import type { Declaration, DirectDependency, ResolvedVersions, UnknownRecord } from "./types.js";
import {
  addDependency,
  addExactPin,
  asRecord,
  lineContaining,
  normalizePackageName,
  parseRequirement,
} from "./shared.js";

function addRequirementList(
  target: Map<string, DirectDependency>,
  path: string,
  contents: string,
  values: unknown,
  resolved: ResolvedVersions,
): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const requirement = parseRequirement(value);
    if (requirement) {
      addDependency(target, path, contents, requirement.name, requirement.constraint);
      addExactPin(resolved, requirement.name, requirement.constraint);
    }
  }
}

export function collectPyprojectDependencies(
  path: string,
  contents: string,
  document: UnknownRecord,
  target: Map<string, DirectDependency>,
  resolved: ResolvedVersions,
): void {
  const project = asRecord(document.project);
  addRequirementList(target, path, contents, project?.dependencies, resolved);
  const optional = asRecord(project?.["optional-dependencies"]);
  for (const values of Object.values(optional ?? {})) {
    addRequirementList(target, path, contents, values, resolved);
  }

  const poetry = asRecord(asRecord(document.tool)?.poetry);
  const addPoetryTable = (value: unknown): void => {
    for (const [name, constraint] of Object.entries(asRecord(value) ?? {})) {
      if (normalizePackageName(name) === "python") continue;
      const rendered = typeof constraint === "string" ? constraint : JSON.stringify(asRecord(constraint) ?? constraint);
      addDependency(target, path, contents, name, rendered);
    }
  };
  addPoetryTable(poetry?.dependencies);
  addPoetryTable(poetry?.["dev-dependencies"]);
  for (const group of Object.values(asRecord(poetry?.group) ?? {})) {
    addPoetryTable(asRecord(group)?.dependencies);
  }
}

/** The `python = "..."` key of the Poetry dependencies table, not the first line that merely mentions Python. */
function poetryPythonLine(contents: string): number {
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\s*python\s*=/i.test(line));
  return index === -1 ? lineContaining(contents, "python") : index + 1;
}

export function collectPyprojectRuntime(path: string, contents: string, document: UnknownRecord): Declaration[] {
  const declarations: Declaration[] = [];
  const projectValue = asRecord(document.project)?.["requires-python"];
  if (typeof projectValue === "string") {
    declarations.push({
      path,
      line: lineContaining(contents, "requires-python"),
      value: projectValue,
      kind: "compatibility range",
    });
  }
  const poetryPython = asRecord(asRecord(asRecord(document.tool)?.poetry)?.dependencies)?.python;
  if (typeof poetryPython === "string") {
    declarations.push({
      path,
      line: poetryPythonLine(contents),
      value: poetryPython,
      kind: "compatibility range",
    });
  }
  return declarations;
}
