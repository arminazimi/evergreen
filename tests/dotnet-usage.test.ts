import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { analyzeSourceUsage } from "../src/source-usage.js";
import type { UsageMatcher } from "../src/domain.js";

const temporaryRoots: string[] = [];
after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-csharp-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const matchers: UsageMatcher[] = [
  { kind: "import", language: "csharp", module: "Acme.Storage" },
  { kind: "call", language: "csharp", module: "Acme.Storage", targets: ["Account.Parse", "Account"] },
  { kind: "call", language: "csharp", module: "Acme.Storage.Blob", targets: ["BlobClient"] },
];

async function usages(files: Record<string, string>) {
  const root = await repository(files);
  const [analysis] = await analyzeSourceUsage(root, [{ id: "c", matchers }]);
  return analysis!.usages.map((usage) => `${usage.kind} ${usage.location.path}:${usage.location.line}:${usage.location.column} ${usage.symbol}`);
}

test("a namespace import, a simple name through it, and a fully qualified name are usages", async () => {
  assert.deepEqual(
    await usages({ "A.cs": "using Acme.Storage;\n\nclass A { void M() { var a = Account.Parse(\"x\"); var b = new Account(); var c = Acme.Storage.Account.Parse(\"y\"); } }\n" }),
    [
      "import A.cs:1:1 Acme.Storage",
      "call A.cs:3:30 Acme.Storage.Account.Parse",
      "call A.cs:3:62 Acme.Storage.Account",
      "call A.cs:3:81 Acme.Storage.Account.Parse",
    ],
  );
});

test("an alias, global using, and using static are imports; only the alias binds a name", async () => {
  assert.deepEqual(
    await usages({ "A.cs": "global using Acme.Storage.Blob;\nusing static Acme.Storage.Account;\nusing S = Acme.Storage;\nclass A { void M() { S.Account.Parse(\"x\"); BlobClient(); Parse(); } }\n" }),
    [
      "import A.cs:1:1 Acme.Storage",
      "import A.cs:2:1 Acme.Storage",
      "import A.cs:3:1 Acme.Storage",
      "call A.cs:4:22 Acme.Storage.Account.Parse",
      "call A.cs:4:44 Acme.Storage.Blob.BlobClient",
    ],
  );
});

test("a simple name needs the using of its own namespace, not of a parent or child", async () => {
  assert.deepEqual(await usages({ "A.cs": "using Acme.Storage;\nclass A { void M() { BlobClient(); } }\n" }), ["import A.cs:1:1 Acme.Storage"]);
  assert.deepEqual(await usages({ "A.cs": "using Acme.Storage.Blob;\nclass A { void M() { Account(); } }\n" }), ["import A.cs:1:1 Acme.Storage"]);
});

test("comments, strings, instance members, other namespaces, and using statements are not usages", async () => {
  assert.deepEqual(
    await usages({
      "A.cs": [
        "using System;",
        "using (var s = new System.IO.MemoryStream()) { }",
        "using var t = new System.IO.MemoryStream();",
        "// using Acme.Storage;",
        "/* Account.Parse(x) */",
        "class A { void M(Helper h) { h.Account.Parse(\"x\"); Other.Account(); var s = \"Acme.Storage.Account.Parse(x)\"; } }",
      ].join("\n"),
    }),
    [],
  );
});

test("only .cs files are read, and a file with no C# usage is empty", async () => {
  assert.deepEqual(await usages({ "A.vb": "Imports Acme.Storage\n", "B.cs": "class B { }\n" }), []);
  const root = resolve("tests/fixtures/dotnet/negative");
  const [analysis] = await analyzeSourceUsage(root, [{ id: "n", matchers }]);
  assert.deepEqual(analysis!.usages, []);
});

test("a verbatim string ending in a backslash does not hide the code after it", async () => {
  assert.deepEqual(
    await usages({ "A.cs": "using Acme.Storage;\nclass A { void M() { var p = @\"C:\\dir\\\"; var a = Account.Parse(p); } }\n" }),
    ["import A.cs:1:1 Acme.Storage", "call A.cs:2:50 Acme.Storage.Account.Parse"],
  );
});

test("a verbatim string spans lines and treats a doubled quote as a literal quote", async () => {
  assert.deepEqual(
    await usages({
      "A.cs": [
        "using Acme.Storage;",
        "class A { void M() {",
        "  var s = $@\"say \"\"Account.Parse(x)\"\" and",
        "Account.Parse(y) still text\";",
        "  var a = Account.Parse(s);",
        "} }",
      ].join("\n"),
    }),
    ["import A.cs:1:1 Acme.Storage", "call A.cs:5:11 Acme.Storage.Account.Parse"],
  );
});

test("an unterminated verbatim string masks the rest of the file instead of failing", async () => {
  assert.deepEqual(await usages({ "A.cs": "using Acme.Storage;\nclass A { string s = @\"open\n Account.Parse(x);\n" }), ["import A.cs:1:1 Acme.Storage"]);
});

test("a method called on an instance, and F# sources, are deliberate limits", async () => {
  assert.deepEqual(
    await usages({
      "A.cs": "using Acme.Storage;\nclass A { void M(CloudStorageAccount account) { var c = account.CreateCloudBlobClient(); } }\n",
      "B.fs": "open Acme.Storage\nlet a = Account.Parse \"x\"\n",
    }),
    ["import A.cs:1:1 Acme.Storage"],
  );
});
