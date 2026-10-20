import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { formatPurl, purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseCmakeLists } from "./parse-cmakelists.js";
import type { CmakeDeclaration } from "./parse-cmakelists.js";
import { parseConanfilePy, parseConanfileTxt } from "./parse-conan.js";
import type { ConanDeclaration } from "./parse-conan.js";
import { parseVcpkgJson } from "./parse-vcpkg.js";
import type { VcpkgDeclaration } from "./parse-vcpkg.js";

/**
 * C and C++ lifecycle detector.
 *
 * It reads `CMakeLists.txt`, `conanfile.txt`, `conanfile.py`, and `vcpkg.json`, and matches each
 * declaration against the rules whose Package URL it names. The first rule whose VERS range contains
 * the version wins. A rule whose VERS is malformed, or whose comparison throws, is skipped, so it
 * cannot hide a later rule. CMake, Conan, and vcpkg are never run and nothing is fetched.
 *
 * Package URLs, when no importer or decision names another scheme. `pkg:generic/cmake` is the identity
 * `tools/importers/cpp-1.ts` writes. `conan` is the Package URL type. vcpkg has no importer yet, so a
 * dependency uses `pkg:vcpkg/<name>` (the name exactly as written). The other declarations are not
 * packages:
 *
 * - `cmake_minimum_required` → `pkg:generic/cmake` and the version as written.
 * - a Conan requirement → `pkg:conan/<name>` and the version as written, without `@user/channel` or `#revision`.
 * - a vcpkg dependency with `version>=` → `pkg:vcpkg/<name>` and that floor. A dependency with no version
 *   matches only a rule that covers every version.
 * - `CMAKE_C_STANDARD` / `CMAKE_CXX_STANDARD` → `pkg:generic/c-standard` or `pkg:generic/cxx-standard`.
 * - a compiler version check → `pkg:generic/c-compiler/<id>` or `pkg:generic/cxx-compiler/<id>`, with the
 *   compiler id lowercased, and the compared version as written. The comparison operator is not interpreted.
 * - `builtin-baseline` → `pkg:generic/vcpkg-baseline` and the commit as written. A semver range does not
 *   contain a commit; a rule that covers every version does.
 *
 * Generator and module rules in the registry are not matched: the parser does not emit those declarations.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const CPP_FILES = new Set(["CMakeLists.txt", "conanfile.txt", "conanfile.py", "vcpkg.json"]);
/** Rules for the policy version in `cmake_minimum_required(VERSION)`. */
const CMAKE_PURL = "pkg:generic/cmake";
/** Rules for a vcpkg `builtin-baseline` commit. */
const VCPKG_BASELINE_PURL = "pkg:generic/vcpkg-baseline";

async function cppFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile() && CPP_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The Package URL a Conan requirement is matched by. The name is kept as written. */
function conanPurl(name: string): string {
  return formatPurl({ type: "conan", name });
}

/** The Package URL a vcpkg dependency is matched by. The name is kept as written. */
function vcpkgPurl(name: string): string {
  return formatPurl({ type: "vcpkg", name });
}

/** The Package URL a `CMAKE_C_STANDARD` or `CMAKE_CXX_STANDARD` value is matched by. */
function languageStandardPurl(language: "c" | "cxx"): string {
  return formatPurl({ type: "generic", name: language === "c" ? "c-standard" : "cxx-standard" });
}

/** The Package URL a compiler version check is matched by. The compiler id is lowercased. */
function compilerPurl(language: "c" | "cxx", compiler: string): string {
  return formatPurl({ type: "generic", namespace: `${language}-compiler`, name: compiler.toLowerCase() });
}

/** The rules of a registry grouped by their canonical Package URL identity; an unreadable purl is skipped. */
function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    let key: string;
    try {
      key = purlIdentity(rule.purl);
    } catch {
      continue;
    }
    const existing = grouped.get(key);
    if (existing) existing.push(rule);
    else grouped.set(key, [rule]);
  }
  return grouped;
}

/** The first rule whose VERS range contains the version. A rule that cannot be compared is skipped, so it cannot hide a later rule. */
function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** True for a rule that names every version. A declaration with no version can only match one of these. */
function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

/** The first rule that covers every version. A malformed VERS is skipped. */
function firstUniversalRule(rules: readonly RegistryV2Rule[]): RegistryV2Rule | undefined {
  return rules.find(coversEveryVersion);
}

function toFinding(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
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

/** Findings for one CMakeLists.txt declaration, or none. */
function findingsForCmake(byPurl: Map<string, RegistryV2Rule[]>, path: string, declaration: CmakeDeclaration): DetectorFinding[] {
  if (declaration.kind === "cmake-minimum-required") {
    const rule = firstMatchingRule(byPurl.get(CMAKE_PURL) ?? [], declaration.value);
    return rule ? [toFinding(rule, path, declaration.line, `${path} declares cmake_minimum_required ${declaration.value}. ${rule.summary}`)] : [];
  }
  if (declaration.kind === "language-standard") {
    const variable = declaration.language === "c" ? "CMAKE_C_STANDARD" : "CMAKE_CXX_STANDARD";
    const rule = firstMatchingRule(byPurl.get(languageStandardPurl(declaration.language)) ?? [], declaration.value);
    return rule ? [toFinding(rule, path, declaration.line, `${path} sets ${variable} ${declaration.value}. ${rule.summary}`)] : [];
  }
  const rule = firstMatchingRule(byPurl.get(compilerPurl(declaration.language, declaration.compiler)) ?? [], declaration.value);
  if (!rule) return [];
  const language = declaration.language === "c" ? "C" : "C++";
  return [toFinding(rule, path, declaration.line, `${path} checks ${declaration.compiler} ${declaration.comparison} ${declaration.value} for ${language}. ${rule.summary}`)];
}

/** Findings for the Conan requirements in one file. */
function findingsForConan(byPurl: Map<string, RegistryV2Rule[]>, path: string, declarations: readonly ConanDeclaration[]): DetectorFinding[] {
  const findings: DetectorFinding[] = [];
  for (const declaration of declarations) {
    const rule = firstMatchingRule(byPurl.get(conanPurl(declaration.name)) ?? [], declaration.value);
    if (rule) findings.push(toFinding(rule, path, declaration.line, `${path} requires ${declaration.name} ${declaration.value}. ${rule.summary}`));
  }
  return findings;
}

/** Findings for the baseline and direct dependencies in one vcpkg.json. */
function findingsForVcpkg(byPurl: Map<string, RegistryV2Rule[]>, path: string, declarations: readonly VcpkgDeclaration[]): DetectorFinding[] {
  const findings: DetectorFinding[] = [];
  for (const declaration of declarations) {
    if (declaration.kind === "vcpkg-baseline") {
      const rule = firstMatchingRule(byPurl.get(VCPKG_BASELINE_PURL) ?? [], declaration.value);
      if (rule) findings.push(toFinding(rule, path, declaration.line, `${path} pins builtin-baseline ${declaration.value}. ${rule.summary}`));
      continue;
    }
    const rules = byPurl.get(vcpkgPurl(declaration.name)) ?? [];
    if (declaration.value === undefined) {
      const rule = firstUniversalRule(rules);
      if (rule) findings.push(toFinding(rule, path, declaration.line, `${path} depends on ${declaration.name}. ${rule.summary}`));
    } else {
      const rule = firstMatchingRule(rules, declaration.value);
      if (rule) findings.push(toFinding(rule, path, declaration.line, `${path} requires ${declaration.name} ${declaration.value} or newer. ${rule.summary}`));
    }
  }
  return findings;
}

export class CppDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "cpp";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: ["CMakeLists.txt", "conanfile.txt", "conanfile.py", "vcpkg.json"] };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/cpp.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/cpp.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await cppFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const findings: DetectorFinding[] = [];

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);

      if (name === "CMakeLists.txt") {
        for (const declaration of parseCmakeLists(contents)) findings.push(...findingsForCmake(byPurl, path, declaration));
      } else if (name === "conanfile.txt") {
        findings.push(...findingsForConan(byPurl, path, parseConanfileTxt(contents)));
      } else if (name === "conanfile.py") {
        findings.push(...findingsForConan(byPurl, path, parseConanfilePy(contents)));
      } else if (name === "vcpkg.json") {
        findings.push(...findingsForVcpkg(byPurl, path, parseVcpkgJson(contents)));
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified: [] };
  }
}

export const cppDetector = new CppDetector();
