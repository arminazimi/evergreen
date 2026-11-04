import { test } from "node:test";

import type { SourceUsageContract } from "../../src/domain.js";
import { analyzeJavaScriptFile } from "../../src/usage/javascript.js";
import { analyzePythonFile } from "../../src/usage/python.js";
import { checkSourceRoundTrip, TEST_TIMEOUT_MS, type SourceRoundTripCase } from "./harness.js";

/**
 * Property tests for the parser-backed source analyzers.
 *
 * These find the call sites a rule's usage matchers describe, so a canonical input is a source that
 * imports a module and calls it. The round trip is that the analysis reports the module, the call it
 * resolved through an alias, and the exact line it read — the alias never appears as the symbol,
 * because the analyzer reports what was imported rather than what was written.
 *
 * `tests/fuzz/parsers.ts` registers these with no contracts, which correctly finds nothing; a case
 * supplies the contract its source declares, over the same call the registry makes.
 */

type JavaScriptLanguage = "javascript" | "typescript";

/** The contract that names one module and the calls of it a rule would flag. */
function usageContract(language: JavaScriptLanguage | "python", module: string, target: string): SourceUsageContract {
  return {
    id: module,
    matchers: [
      { kind: "import", language, module },
      { kind: "call", language, module, targets: [target] },
    ],
  };
}

/** The module a case's generated source imports, taken back out of it for the contract. */
function nameOf(source: string, language: JavaScriptLanguage | "python"): string {
  const match = language === "python" ? /^import (\S+)/.exec(source) : /^import \w+ from "([^"]+)"/.exec(source);
  return match?.[1] ?? "";
}

const CASES: readonly SourceRoundTripCase[] = [
  {
    name: "analyzeJavaScriptFile",
    source: ({ name, version }) => `import legacy from "${name}";\nlegacy.get("https://example.com/${version}");\n`,
    run: (source) => analyzeJavaScriptFile({ path: "source.js", language: "javascript", source }, [contract(source)]),
    names: "zzmark|zlegacy-tool",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [name, `${name}.get`, `legacy.get("https://example.com/${version}");`],
  },
  {
    name: "analyzeTypeScriptFile",
    source: ({ name, version }) => `import legacy from "${name}";\nlegacy.get("https://example.com/${version}");\n`,
    run: (source) =>
      analyzeJavaScriptFile({ path: "source.ts", language: "typescript", source }, [contract(source, "typescript")]),
    names: "zzmark|zlegacy-tool",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [name, `${name}.get`, `legacy.get("https://example.com/${version}");`],
  },
  {
    name: "analyzePythonFile",
    source: ({ name, version }) => `import ${name}\n${name}.ArgumentParser("tool ${version}")\n`,
    run: (source) => analyzePythonFile({ path: "source.py", language: "python", source }, [contract(source, "python")]),
    names: "zzmark|zlegacy_tool",
    versions: "9.8.7|1.21.0",
    markers: ({ name, version }) => [name, `${name}.ArgumentParser`, `${name}.ArgumentParser("tool ${version}")`],
  },
];

/** The contract the case's source declares: the module it imports, called through its main entry. */
function contract(source: string, language: JavaScriptLanguage | "python" = "javascript"): SourceUsageContract {
  const target = language === "python" ? "ArgumentParser" : "get";
  return usageContract(language, nameOf(source, language), target);
}

for (const target of CASES) {
  test(`${target.name} reports the usage a canonical source declares`, { timeout: TEST_TIMEOUT_MS }, async () => {
    await checkSourceRoundTrip(target);
  });
}
