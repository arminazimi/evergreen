import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import type { SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

const requestContract: SourceUsageContract = {
  id: "request",
  matchers: [
    { kind: "import", language: "typescript", module: "request" },
    {
      kind: "call",
      language: "typescript",
      module: "request",
      targets: ["default", "get", "post"],
    },
    { kind: "import", language: "javascript", module: "request" },
    {
      kind: "call",
      language: "javascript",
      module: "request",
      targets: ["default", "get", "post"],
    },
  ],
};

test("locates JavaScript and TypeScript imports and alias-aware calls", async () => {
  const root = await repository({
    "src/client.ts": `import legacyRequest from "request";
legacyRequest.get("https://example.com");
const text = "legacyRequest.post()";
// legacyRequest.post("ignored");
`,
    "src/worker.cjs": `const { post: send } = require("request");
send({ url: "https://example.com" });
`,
    "node_modules/request/index.js": `module.exports = request;
request.get();
`,
  });

  const [analysis] = await analyzeSourceUsage(root, [requestContract]);

  assert.equal(analysis?.usages.length, 4);
  assert.deepEqual(
    analysis?.usages.map((usage) => [usage.kind, usage.location.path, usage.location.line]),
    [
      ["import", "src/client.ts", 1],
      ["call", "src/client.ts", 2],
      ["import", "src/worker.cjs", 1],
      ["call", "src/worker.cjs", 2],
    ],
  );
  assert.deepEqual(analysis?.impact, { usageCount: 4, affectedFiles: 2, level: "medium" });
});

test("locates Python imports, imported calls, and configuration keys", async () => {
  const root = await repository({
    "app.py": `import nose as legacy
legacy.run()
from nose import main as nose_main
nose_main()
`,
    "settings.py": `TEST_RUNNER = "django_nose.NoseTestSuiteRunner"
`,
    "setup.cfg": `[aliases]
test_suite = nose.collector
`,
  });
  const contracts: SourceUsageContract[] = [
    {
      id: "nose",
      matchers: [
        { kind: "import", language: "python", module: "nose" },
        { kind: "call", language: "python", module: "nose", targets: ["run", "main"] },
        {
          kind: "config-key",
          language: "ini",
          key: "test_suite",
          valueIncludes: "nose.collector",
        },
      ],
    },
    {
      id: "django-nose",
      matchers: [
        {
          kind: "config-key",
          language: "python",
          key: "TEST_RUNNER",
          valueIncludes: "django_nose",
        },
      ],
    },
  ];

  const analyses = await analyzeSourceUsage(root, contracts);

  assert.equal(analyses[0]?.usages.length, 5);
  assert.equal(analyses[1]?.usages.length, 1);
  assert.equal(analyses[1]?.usages[0]?.location.line, 1);
  assert.equal(analyses[1]?.usages[0]?.location.column, 1);
});

test("reports no usages for lookalikes in comments and strings", async () => {
  const root = await repository({
    "src/clean.ts": `// import request from "request";
const example = "request.get()";
export function requestFactory() {}
`,
  });

  const [analysis] = await analyzeSourceUsage(root, [requestContract]);

  assert.deepEqual(analysis?.usages, []);
  assert.deepEqual(analysis?.impact, { usageCount: 0, affectedFiles: 0, level: "none" });
});

test("evaluates symbol matchers with the parser and ignores them in the regex scanner", async () => {
  const root = await repository({ "src/app.js": "import { render } from 'react-dom';\nrender(app, root);\n" });
  const contracts: SourceUsageContract[] = [
    {
      id: "react-dom-render",
      matchers: [{ kind: "symbol", language: "javascript", module: "react-dom", symbol: "render", shape: "call" }],
    },
  ];
  const [parsed] = await analyzeSourceUsage(root, contracts);
  assert.deepEqual(
    parsed?.usages.map((usage) => [usage.kind, usage.symbol, usage.location.line, usage.location.column]),
    [["symbol", "react-dom.render", 2, 1]],
  );
  const [regex] = await analyzeSourceUsage(root, contracts, { parser: false });
  assert.deepEqual(regex?.usages, []);
});
