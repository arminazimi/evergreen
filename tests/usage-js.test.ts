import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import type { SourceUsage, SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";
import { maximumParseBytes } from "../src/usage/tree-sitter.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const contract: SourceUsageContract = {
  id: "request",
  matchers: (["javascript", "typescript"] as const).flatMap((language) => [
    { kind: "import" as const, language, module: "request" },
    { kind: "call" as const, language, module: "request", targets: ["default", "get", "post", "Client", "defaults.get"] },
  ]),
};

function languageOf(path: string): "javascript" | "typescript" {
  return /\.(?:ts|tsx|mts|cts)$/.test(path) ? "typescript" : "javascript";
}

async function treeSitterUsages(files: Record<string, string>): Promise<SourceUsage[]> {
  const usages: SourceUsage[] = [];
  for (const [path, source] of Object.entries(files)) {
    const result = await analyzeJavaScriptFile({ path, language: languageOf(path), source }, [contract]);
    assert.ok(result, `${path} parsed`);
    usages.push(...result.get("request")!);
  }
  return usages.sort(
    (left, right) =>
      left.location.path.localeCompare(right.location.path) ||
      (left.location.line ?? 0) - (right.location.line ?? 0) ||
      (left.location.column ?? 0) - (right.location.column ?? 0),
  );
}

async function regexUsages(files: Record<string, string>): Promise<SourceUsage[]> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-usage-js-"));
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
  "default-import.ts": `import legacyRequest from "request";\nlegacyRequest.get("https://example.com");\nconst text = "legacyRequest.post()";\n// legacyRequest.post("ignored");\n`,
  "namespace.ts": `import * as r from 'request';\nr.post({ url });\nr(options);\n`,
  "named.ts": `import { get as fetchIt, post } from "request";\nfetchIt(url);\npost(url);\n`,
  "default-and-named.js": `import request, { get } from "request";\nrequest(url);\nget(url);\n`,
  "side-effect.js": `import "request";\n`,
  "type-only.ts": `import type { Options } from "request";\nimport request from "request";\nrequest.get(url as string);\n`,
  "commonjs.cjs": `const { post: send } = require("request");\nsend({ url: "https://example.com" });\nconst request = require('request');\nrequest.get(url);\nrequest(url);\nlet old = require("request");\nold.post(url);\n`,
  "dynamic.mjs": `const loaded = import("request");\n`,
  "constructors.js": `const r = require("request");\nconst client = new r.Client();\n`,
  "lookalikes.ts": `// import request from "request";\nconst example = "request.get()";\nexport function requestFactory() {}\n`,
};

// Import columns are compared by line only: the regex scanner points `import request from "request"` at the
// binding name because it searches for the module text from the start of the statement.
const byLine = (usages: SourceUsage[]): string[] =>
  usages.map((usage) => `${usage.kind} ${usage.location.path}:${usage.location.line} ${usage.symbol}`);

test("tree-sitter results are a superset of the regex scanner on the existing cases", async () => {
  const expected = byLine(await regexUsages(regexCases));
  assert.ok(expected.length >= 18, "the cases exercise many regex results");
  const actual = new Set(byLine(await treeSitterUsages(regexCases)));
  for (const usage of expected) assert.ok(actual.has(usage), `missing ${usage}`);
});

test("reports calls at the same locations as the regex scanner", async () => {
  const calls = (usages: SourceUsage[]): string[] => summary(usages).filter((entry) => entry.startsWith("call"));
  assert.deepEqual(calls(await treeSitterUsages(regexCases)), calls(await regexUsages(regexCases)));
});

test("reports the same locations and excerpts for plain imports and calls", async () => {
  const files = { "src/client.ts": `import legacyRequest from "request";\n  legacyRequest.get("https://example.com");\n` };
  const [regex, parsed] = [await regexUsages(files), await treeSitterUsages(files)];
  assert.deepEqual(parsed, regex);
  assert.deepEqual(parsed.map((usage) => [usage.kind, usage.location.line, usage.location.column, usage.excerpt]), [
    ["import", 1, 28, 'import legacyRequest from "request";'],
    ["call", 2, 3, 'legacyRequest.get("https://example.com");'],
  ]);
});

test("follows aliases of imported symbols", async () => {
  const usages = await treeSitterUsages({
    "alias.ts": `import request from "request";
const get = request.get;
const { post: send } = request;
const again = request;
get(url);
send(url);
again.get(url);
again(options);
const { get: finalGet } = again;
finalGet(url);
`,
    "alias-require.js": `const get = require("request").get;
get(url);
const lib = require("request");
const defaults = lib.defaults;
defaults.get(url);
`,
  });
  assert.deepEqual(summary(usages), [
    "import alias-require.js:1:22 request",
    "call alias-require.js:2:1 request.get",
    "import alias-require.js:3:22 request",
    "call alias-require.js:5:1 request.defaults.get",
    "import alias.ts:1:22 request",
    "call alias.ts:5:1 request.get",
    "call alias.ts:6:1 request.post",
    "call alias.ts:7:1 request.get",
    "call alias.ts:8:1 request",
    "call alias.ts:10:1 request.get",
  ]);
});

test("detects calls that span several lines", async () => {
  const usages = await treeSitterUsages({
    "multiline.ts": `import request from "request";
request
  .get(
    "https://example.com",
  );
const client = new request
  .Client();
request?.post(url);
(request as any).get(url);
request!.get(url);
`,
  });
  assert.deepEqual(summary(usages), [
    "import multiline.ts:1:22 request",
    "call multiline.ts:2:1 request.get",
    "call multiline.ts:6:20 request.Client",
    "call multiline.ts:8:1 request.post",
    "call multiline.ts:9:2 request.get",
    "call multiline.ts:10:1 request.get",
  ]);
});

test("detects multi-line imports, re-exports, inline requires, and dynamic imports", async () => {
  const usages = await treeSitterUsages({
    "reexport.ts": `export { get } from "request";\nexport * from 'request';\nimport legacy = require("request");\nlegacy.get(url);\n`,
    "inline.js": `module.exports = require("request");\nrequire("request").get(url);\nconst mod = await import("request");\nmod.post(url);\nconst { get } = await import("request");\nget(url);\n`,
    "multi.ts": `import {\n  get,\n  post as send,\n} from "request";\nsend(url);\nget(url);\n`,
  });
  assert.deepEqual(summary(usages), [
    "import inline.js:1:27 request",
    "import inline.js:2:10 request",
    "import inline.js:3:27 request",
    "call inline.js:4:1 request.post",
    "import inline.js:5:31 request",
    "call inline.js:6:1 request.get",
    "import multi.ts:4:9 request",
    "call multi.ts:5:1 request.post",
    "call multi.ts:6:1 request.get",
    "import reexport.ts:1:22 request",
    "import reexport.ts:2:16 request",
    "import reexport.ts:3:26 request",
    "call reexport.ts:4:1 request.get",
  ]);
});

test("ignores lookalikes: other modules, other members, comments, and strings", async () => {
  const usages = await treeSitterUsages({
    "lookalike.ts": `import other from "requests";
import request from "request-promise";
other.get(url);
request.get(url);
const holder = { request: () => 1 };
holder.request();
const get = () => 1;
get();
/* import request from "request" */
const text = \`request.get()\`;
`,
  });
  assert.deepEqual(usages, []);
});

test("columns count UTF-16 code units", async () => {
  const files = { "unicode.ts": `const label = "héllo 😀"; import request from "request"; request.get(label);\n` };
  assert.deepEqual(summary(await treeSitterUsages(files)), ["import unicode.ts:1:48 request", "call unicode.ts:1:58 request.get"]);
});

test("parses JSX and TSX and tolerates syntax errors", async () => {
  const usages = await treeSitterUsages({
    "view.jsx": `import request from "request";\nexport const View = () => <div onClick={() => request.get(url)} />;\n`,
    "view.tsx": `import request from "request";\nexport const View = (): JSX.Element => <div onClick={() => request.post(url as string)} />;\n`,
    "broken.js": `import request from "request";\nrequest.get(url);\nfunction (( {\n`,
  });
  assert.deepEqual(
    summary(usages).filter((entry) => entry.startsWith("call")),
    ["call broken.js:2:1 request.get", "call view.jsx:2:47 request.get", "call view.tsx:2:60 request.post"],
  );
});

test("returns undefined for files over the size bound so callers can fall back", async () => {
  const result = await analyzeJavaScriptFile(
    { path: "big.js", language: "javascript", source: `// ${"x".repeat(maximumParseBytes)}\n` },
    [contract],
  );
  assert.equal(result, undefined);
});
