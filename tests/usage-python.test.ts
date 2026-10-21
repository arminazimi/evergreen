import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import type { SourceUsage, SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";
import { analyzePythonFile } from "../src/usage/python.js";
import { maximumParseBytes } from "../src/usage/tree-sitter.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const contract: SourceUsageContract = {
  id: "requests",
  matchers: [
    { kind: "import", language: "python", module: "requests" },
    { kind: "call", language: "python", module: "requests", targets: ["default", "get", "post", "Session", "adapters.HTTPAdapter"] },
  ],
};

async function treeSitterUsages(files: Record<string, string>): Promise<SourceUsage[]> {
  const usages: SourceUsage[] = [];
  for (const [path, source] of Object.entries(files)) {
    const result = await analyzePythonFile({ path, language: "python", source }, [contract]);
    assert.ok(result, `${path} parsed`);
    usages.push(...result.get("requests")!);
  }
  return usages.sort(
    (left, right) =>
      left.location.path.localeCompare(right.location.path) ||
      (left.location.line ?? 0) - (right.location.line ?? 0) ||
      (left.location.column ?? 0) - (right.location.column ?? 0),
  );
}

async function regexUsages(files: Record<string, string>): Promise<SourceUsage[]> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-usage-python-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const [analysis] = await analyzeSourceUsage(root, [contract]);
  return analysis!.usages;
}

const summary = (usages: SourceUsage[]): string[] =>
  usages.map((usage) => `${usage.kind} ${usage.location.path}:${usage.location.line}:${usage.location.column} ${usage.symbol}`);

const regexCases: Record<string, string> = {
  "plain.py": `import requests\nrequests.get("https://example.com")\ntext = "requests.post()"\n# requests.post("ignored")\n`,
  "aliased.py": `import requests as http\nhttp.post(url, data=data)\nhttp(options)\n`,
  "from-import.py": `from requests import get, post as send\nget(url)\nsend(url)\n`,
  "submodule.py": `import requests.adapters\nrequests.get(url)\nfrom requests.adapters import HTTPAdapter\nHTTPAdapter()\n`,
  "constructors.py": `import requests\nsession = requests.Session()\n`,
  "lookalikes.py": `# import requests\nexample = "requests.get()"\ndef requests_factory(): pass\nimport requests_toolbelt\nrequests_toolbelt.get(url)\n`,
};

// Import columns are compared by line only: the regex scanner finds the module by searching the line for its text.
const byLine = (usages: SourceUsage[]): string[] =>
  usages.map((usage) => `${usage.kind} ${usage.location.path}:${usage.location.line} ${usage.symbol}`);

test("tree-sitter results are a superset of the regex scanner on the existing cases", async () => {
  const expected = byLine(await regexUsages(regexCases));
  assert.ok(expected.length >= 10, "the cases exercise many regex results");
  const actual = new Set(byLine(await treeSitterUsages(regexCases)));
  for (const usage of expected) assert.ok(actual.has(usage), `missing ${usage}`);
});

test("reports calls at the same locations as the regex scanner", async () => {
  const calls = (usages: SourceUsage[]): string[] => summary(usages).filter((entry) => entry.startsWith("call"));
  assert.deepEqual(calls(await treeSitterUsages(regexCases)), calls(await regexUsages(regexCases)));
});

test("reports the same locations and excerpts for plain imports and calls", async () => {
  const files = { "src/client.py": `import requests\n  requests.get("https://example.com")\n` };
  const [regex, parsed] = [await regexUsages(files), await treeSitterUsages(files)];
  assert.deepEqual(parsed, regex);
  assert.deepEqual(parsed.map((usage) => [usage.kind, usage.location.line, usage.location.column, usage.excerpt]), [
    ["import", 1, 8, "import requests"],
    ["call", 2, 3, 'requests.get("https://example.com")'],
  ]);
});

test("detects imports, from-imports, and wildcard imports", async () => {
  const usages = await treeSitterUsages({
    "imports.py": `import os, requests\nimport requests.adapters as adapters\nfrom requests import *\nfrom requests.adapters import (\n    HTTPAdapter,\n)\nfrom . import requests\n`,
  });
  assert.deepEqual(
    summary(usages).filter((entry) => entry.startsWith("import")),
    ["import imports.py:1:12 requests", "import imports.py:2:8 requests", "import imports.py:3:6 requests", "import imports.py:4:6 requests"],
  );
});

test("follows aliases of imported symbols", async () => {
  const usages = await treeSitterUsages({
    "alias.py": `import requests
get = requests.get
session = requests
fetch = session.get
get(url)
session.post(url)
fetch(url)
session(options)
`,
    "from-alias.py": `from requests import get as fetch, adapters as a
again = fetch
again(url)
a.HTTPAdapter()
`,
  });
  assert.deepEqual(summary(usages), [
    "import alias.py:1:8 requests",
    "call alias.py:5:1 requests.get",
    "call alias.py:6:1 requests.post",
    "call alias.py:7:1 requests.get",
    "call alias.py:8:1 requests",
    "import from-alias.py:1:6 requests",
    "call from-alias.py:3:1 requests.get",
    "call from-alias.py:4:1 requests.adapters.HTTPAdapter",
  ]);
});

test("detects calls that span several lines and imports inside functions", async () => {
  const usages = await treeSitterUsages({
    "multiline.py": `def handler():
    import requests
    return requests.get(
        "https://example.com",
    )

client = (requests
    .Session())
`,
  });
  assert.deepEqual(summary(usages), [
    "import multiline.py:2:12 requests",
    "call multiline.py:3:12 requests.get",
    "call multiline.py:7:11 requests.Session",
  ]);
});

test("ignores lookalikes: other modules, other members, comments, and strings", async () => {
  const usages = await treeSitterUsages({
    "lookalike.py": `import requests_toolbelt
from other import requests
requests_toolbelt.get(url)
requests.get(url)
holder = {"requests": lambda: 1}
holder["requests"]()
get = lambda: 1
get()
# import requests
text = """requests.get()"""
`,
  });
  assert.deepEqual(usages, []);
});

test("columns count UTF-16 code units", async () => {
  const files = { "unicode.py": `label = "héllo 😀"; import requests; requests.get(label)\n` };
  assert.deepEqual(summary(await treeSitterUsages(files)), ["import unicode.py:1:28 requests", "call unicode.py:1:38 requests.get"]);
});

test("tolerates syntax errors", async () => {
  const usages = await treeSitterUsages({ "broken.py": `import requests\nrequests.get(url)\ndef (( :\n` });
  assert.deepEqual(summary(usages).filter((entry) => entry.startsWith("call")), ["call broken.py:2:1 requests.get"]);
});

test("returns undefined for files over the size bound so callers can fall back", async () => {
  const result = await analyzePythonFile({ path: "big.py", language: "python", source: `# ${"x".repeat(maximumParseBytes)}\n` }, [contract]);
  assert.equal(result, undefined);
});
