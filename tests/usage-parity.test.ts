import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { after, before, test } from "node:test";

import type { SourceLanguage, SourceUsage, SourceUsageContract, UsageMatcher } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";
import { analyzePythonFile } from "../src/usage/python.js";

/*
 * Parity between the regex scanner and the tree-sitter analyzers. Both engines run over the same files with the same
 * contracts, and every difference is listed. A difference is acceptable only when it is an improvement: a usage the
 * parser finds that the regex scanner cannot (multi-line calls, aliases, re-exports), or a regex hit that is not code.
 * Anything else fails, so the switch to the parser cannot silently lose a usage.
 */

const repositoryRoot = join(import.meta.dirname, "..", "..");
const fixtureRoot = join(repositoryRoot, "tests", "fixtures", "usage-parity");
const treeSitterLanguages = new Set<SourceLanguage>(["javascript", "typescript", "python"]);

let corpus: string;

before(async () => {
  corpus = await mkdtemp(join(tmpdir(), "evergreen-usage-parity-"));
  await cp(fixtureRoot, join(corpus, "samples"), { recursive: true });
  // The repository's own sources are a real, offline body of TypeScript and JavaScript.
  for (const directory of ["src", "tools", "benchmarks", "examples"]) {
    await cp(join(repositoryRoot, directory), join(corpus, "repository", directory), {
      recursive: true,
      filter: (source) => !source.includes("node_modules") && (extname(source) === "" || /\.(?:ts|tsx|js|mjs|cjs|py)$/.test(source)),
    });
  }
});

after(async () => {
  await rm(corpus, { recursive: true, force: true });
});

function languageOf(path: string): SourceLanguage | undefined {
  const extension = extname(path).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return "javascript";
  if ([".ts", ".tsx", ".mts", ".cts"].includes(extension)) return "typescript";
  if (extension === ".py") return "python";
  return undefined;
}

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (treeSitterLanguages.has(languageOf(path)!)) found.push(path);
  }
  return found.sort();
}

async function registryContracts(): Promise<SourceUsageContract[]> {
  const contracts: SourceUsageContract[] = [];
  for (const name of await readdir(join(repositoryRoot, "registry"))) {
    if (!name.endsWith(".json") || name === "sources.lock.json") continue;
    const registry = JSON.parse(await readFile(join(repositoryRoot, "registry", name), "utf8")) as {
      rules?: { id: string; usage?: UsageMatcher[] }[];
    };
    for (const rule of registry.rules ?? []) {
      const matchers = (rule.usage ?? []).filter(
        (matcher) => matcher.kind !== "config-key" && matcher.kind !== "symbol" && treeSitterLanguages.has(matcher.language),
      );
      if (matchers.length > 0) contracts.push({ id: rule.id, matchers });
    }
  }
  return contracts;
}

/**
 * True when the regex hit is not a call of the import: a method call on an unrelated receiver, such as `lines.join("\n")`
 * matched as `node:path.join` (the regex scanner only rejects a leading identifier character), or a method signature in a
 * type declaration, such as `resolve(...paths: string[]): string;`.
 */
async function isNotACallOfTheImport(subdirectory: string, entry: string): Promise<boolean> {
  const [, , location, symbol] = entry.split(" ") as [string, string, string, string];
  const [path, line] = location.split(":") as [string, string];
  const name = symbol.slice(symbol.lastIndexOf(".") + 1);
  const text = (await readFile(join(corpus, subdirectory, path), "utf8")).split(/\r?\n/)[Number(line) - 1]!;
  const memberCall = new RegExp(`\\.\\s*${name}\\s*\\(`).test(text) && !new RegExp(`(?<![\\w$.])${name}\\s*\\(`).test(text);
  const signature = new RegExp(`^\\s*${name}\\s*\\(.*\\)\\s*:\\s*[^;]+;\\s*$`).test(text);
  return memberCall || signature;
}

/** Contracts for libraries the corpus really uses, so the real sources produce a meaningful number of usages. */
const corpusContracts: SourceUsageContract[] = [
  {
    id: "request",
    matchers: (["javascript", "typescript"] as const).flatMap((language) => [
      { kind: "import" as const, language, module: "request" },
      { kind: "call" as const, language, module: "request", targets: ["default", "get", "post"] },
    ]),
  },
  {
    id: "requests",
    matchers: [
      { kind: "import", language: "python", module: "requests" },
      { kind: "call", language: "python", module: "requests", targets: ["get", "post"] },
    ],
  },
  {
    id: "node-modules",
    matchers: (["javascript", "typescript"] as const).flatMap((language) => [
      { kind: "import" as const, language, module: "node:fs/promises" },
      { kind: "call" as const, language, module: "node:fs/promises", targets: ["readFile", "writeFile", "mkdir", "readdir", "rm"] },
      { kind: "import" as const, language, module: "node:path" },
      { kind: "call" as const, language, module: "node:path", targets: ["join", "resolve", "dirname", "relative"] },
      { kind: "import" as const, language, module: "node:assert/strict" },
      { kind: "call" as const, language, module: "node:assert/strict", targets: ["default", "equal", "deepEqual"] },
    ]),
  },
];

const identify = (usage: SourceUsage): string => `${usage.kind} ${usage.location.path}:${usage.location.line} ${usage.symbol}`;

interface Differences {
  /** Found by both engines. */
  shared: string[];
  /** Found only by the regex scanner. */
  onlyRegex: string[];
  /** Found only by tree-sitter. */
  onlyTreeSitter: string[];
}

async function compare(contracts: readonly SourceUsageContract[], subdirectory: string): Promise<Differences> {
  const root = join(corpus, subdirectory);
  const regex = new Set<string>();
  for (const analysis of await analyzeSourceUsage(root, contracts)) {
    for (const usage of analysis.usages) regex.add(`${analysis.contractId} ${identify(usage)}`);
  }
  const parsed = new Set<string>();
  for (const path of await files(root)) {
    const language = languageOf(path) as "javascript" | "typescript" | "python";
    const source = await readFile(path, "utf8");
    const relativePath = relative(root, path).split("\\").join("/");
    const result =
      language === "python"
        ? await analyzePythonFile({ path: relativePath, language, source }, contracts)
        : await analyzeJavaScriptFile({ path: relativePath, language, source }, contracts);
    assert.ok(result, `${relativePath} parsed`);
    for (const [id, usages] of result) for (const usage of usages) parsed.add(`${id} ${identify(usage)}`);
  }
  const sorted = (values: Iterable<string>): string[] => [...values].sort();
  return {
    shared: sorted([...regex].filter((entry) => parsed.has(entry))),
    onlyRegex: sorted([...regex].filter((entry) => !parsed.has(entry))),
    onlyTreeSitter: sorted([...parsed].filter((entry) => !regex.has(entry))),
  };
}

test("on the fixtures tree-sitter finds every regex usage except one that is not code, and adds only parser-visible forms", async () => {
  const { shared, onlyRegex, onlyTreeSitter } = await compare(corpusContracts, "samples");
  assert.ok(shared.length >= 20, "the fixtures exercise many shared results");
  assert.deepEqual(onlyRegex, [
    // JSX text is not code: `<p>call request.get(url) to download</p>`.
    "request call view.tsx:4 request.get",
  ]);
  assert.deepEqual(onlyTreeSitter, [
    "request call modern.mts:10 request.get",
    "request call modern.mts:15 request.get",
    "request call modern.mts:8 request.post",
    "request import modern.mts:5 request",
    "requests call modern.py:6 requests.get",
  ]);
});

test("on the registry contracts the fixtures differ only by the same improvements", async () => {
  const contracts = await registryContracts();
  assert.ok(contracts.length > 50, "the registry carries many parser-readable contracts");
  const { shared, onlyRegex, onlyTreeSitter } = await compare(contracts, "samples");
  assert.ok(shared.length >= 10, "the registry contracts match fixture code");
  assert.deepEqual(onlyRegex.filter((entry) => !entry.endsWith("view.tsx:4 request.get")), []);
  for (const entry of onlyTreeSitter) assert.match(entry, / modern\.(?:mts|py):\d+ /, `${entry} is a form only the parser sees`);
});

test("on the repository's own sources tree-sitter loses nothing, adds nothing, and drops only hits that are not calls of the import", async () => {
  const { shared, onlyRegex, onlyTreeSitter } = await compare(corpusContracts, "repository");
  assert.ok(shared.length >= 100, `the repository sources produce many usages (${shared.length})`);
  assert.ok(onlyRegex.length > 0, "the regex scanner mistakes some method calls and type signatures for imported functions");
  for (const entry of onlyRegex) {
    assert.ok(await isNotACallOfTheImport("repository", entry), `${entry} is not a method call on an unrelated receiver or a type signature`);
  }
  assert.deepEqual(onlyTreeSitter, []);
});

test("on the repository's own sources the registry contracts agree between engines", async () => {
  const { onlyRegex, onlyTreeSitter } = await compare(await registryContracts(), "repository");
  assert.deepEqual(onlyRegex, []);
  assert.deepEqual(onlyTreeSitter, []);
});
