import assert from "node:assert/strict";
import { test } from "node:test";

import type { SourceUsage, SymbolUsageMatcher } from "../src/domain.js";
import { analyzeJavaScriptFile } from "../src/usage/javascript.js";
import { analyzePythonFile } from "../src/usage/python.js";

async function jsLines(source: string, matchers: Omit<SymbolUsageMatcher, "kind" | "language">[], language: "javascript" | "typescript" = "javascript"): Promise<string[]> {
  const result = await analyzeJavaScriptFile({ path: `x.${language === "typescript" ? "ts" : "js"}`, language, source }, [
    { id: "r", matchers: matchers.map((matcher) => ({ ...matcher, kind: "symbol" as const, language })) },
  ]);
  return describe(result?.get("r"));
}

async function pyLines(source: string, matchers: Omit<SymbolUsageMatcher, "kind" | "language">[]): Promise<string[]> {
  const result = await analyzePythonFile({ path: "x.py", language: "python", source }, [
    { id: "r", matchers: matchers.map((matcher) => ({ ...matcher, kind: "symbol" as const, language: "python" as const })) },
  ]);
  return describe(result?.get("r"));
}

const describe = (usages: SourceUsage[] | undefined): string[] => (usages ?? []).map((usage) => `${usage.kind} ${usage.location.line}:${usage.location.column} ${usage.symbol}`);

test("a call is found through imports, aliases, destructuring, and the node: prefix", async () => {
  const source = `import fs from "node:fs";
const { exists } = require("fs");
const check = fs.exists;
fs.exists("a", cb);
exists("b", cb);
check("c", cb);
fs.existsSync("d");
`;
  assert.deepEqual(await jsLines(source, [{ module: "fs", symbol: "exists", shape: "call" }]), [
    "symbol 4:1 fs.exists",
    "symbol 5:1 fs.exists",
    "symbol 6:1 fs.exists",
  ]);
});

test("a global is reported unless the file binds the name itself", async () => {
  const matchers = [{ symbol: "Buffer", shape: "construct" as const }, { symbol: "process.binding", shape: "call" as const }];
  assert.deepEqual(await jsLines(`new Buffer(1);\nBuffer(2);\nprocess.binding("fs");\n`, matchers), ["symbol 1:5 Buffer", "symbol 3:1 process.binding"]);
  assert.deepEqual(await jsLines(`import { Buffer } from "buffer";\nnew Buffer(1);\n`, matchers), []);
});

test("construct, call, and reference are different shapes", async () => {
  const source = `new Thing();\nThing();\nconst x = Thing;\nuse(Thing);\nclass Thing {}\nfunction f(Thing) {}\n`;
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "construct" }]), ["symbol 1:5 Thing"]);
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "call" }]), ["symbol 2:1 Thing"]);
  assert.deepEqual(await jsLines(source, [{ symbol: "Thing", shape: "reference" }]), ["symbol 3:11 Thing", "symbol 4:5 Thing"]);
});

test("an option is read from the object at the declared argument, and defaults to the last", async () => {
  const source = `const fs = require("fs");
fs.rmdir("d", { recursive: true }, cb);
fs.rmdir("d", cb);
fs.rmdirSync("d", { recursive: true });
fs.rmdir("d", { force: true }, cb);
`;
  const at1 = { module: "fs", symbol: "rmdir", shape: "option" as const, option: "recursive", argument: 1 };
  assert.deepEqual(await jsLines(source, [at1]), ["symbol 2:17 fs.rmdir(recursive)"]);
  assert.deepEqual(await jsLines(source, [{ ...at1, symbol: "rmdirSync", argument: undefined as never }]), ["symbol 4:19 fs.rmdirSync(recursive)"]);
});

test("TypeScript wrappers do not hide a call", async () => {
  assert.deepEqual(
    await jsLines(`import * as url from "url";\n(url as any).parse(x);\nurl!.parse(y);\n`, [{ module: "url", symbol: "parse", shape: "call" }], "typescript"),
    ["symbol 2:2 url.parse", "symbol 3:1 url.parse"],
  );
});

test("Python: calls through imports and aliases, references, and options by keyword or position", async () => {
  const source = `import datetime
from datetime import datetime as dt
import shutil
import ast
datetime.datetime.utcnow()
dt.utcnow()
now = dt.utcnow
shutil.rmtree("d", onerror=h)
shutil.rmtree("d", False, h)
shutil.rmtree("d", onexc=h)
isinstance(n, ast.Num)
`;
  assert.deepEqual(await pyLines(source, [{ module: "datetime", symbol: "datetime.utcnow", shape: "call" }]), ["symbol 5:1 datetime.datetime.utcnow", "symbol 6:1 datetime.datetime.utcnow"]);
  assert.deepEqual(await pyLines(source, [{ module: "shutil", symbol: "rmtree", shape: "option", option: "onerror", argument: 2 }]), [
    "symbol 8:20 shutil.rmtree(onerror)",
    "symbol 9:27 shutil.rmtree(onerror)",
  ]);
  assert.deepEqual(await pyLines(source, [{ module: "ast", symbol: "Num", shape: "reference" }]), ["symbol 11:15 ast.Num"]);
});
