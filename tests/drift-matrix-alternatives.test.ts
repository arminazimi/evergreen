import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { analyzeDrift } from "../src/drift/index.js";
import { goDriftCollector } from "../src/drift/go.js";
import { javaCollector } from "../src/drift/java.js";
import { rubyDriftCollector } from "../src/drift/ruby.js";
import type { DriftCollector } from "../src/drift/types.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-matrix-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const workflow = (action: string, input: string, versions: string[]): string =>
  `jobs:\n  test:\n    strategy:\n      matrix:\n        v: [${versions.map((v) => `'${v}'`).join(", ")}]\n    steps:\n      - uses: ${action}\n        with:\n          ${input}: \${{ matrix.v }}\n`;

const cases: {
  name: string;
  collector: DriftCollector;
  files: Record<string, string>;
  alone: string;
  agrees: string;
  clashes: Record<string, string>;
}[] = [
  {
    name: "ruby",
    collector: rubyDriftCollector,
    files: { ".github/workflows/ci.yml": workflow("ruby/setup-ruby@v1", "ruby-version", ["3.1", "3.2", "3.3"]) },
    alone: "",
    agrees: ".ruby-version",
    clashes: { ".ruby-version": "3.4.1\n" },
  },
  {
    name: "go",
    collector: goDriftCollector,
    files: { ".github/workflows/ci.yml": workflow("actions/setup-go@v5", "go-version", ["1.21", "1.22", "1.23"]) },
    alone: "",
    agrees: ".go-version",
    clashes: { ".go-version": "1.25.0\n" },
  },
  {
    name: "java",
    collector: javaCollector,
    files: { ".github/workflows/ci.yml": workflow("actions/setup-java@v4", "java-version", ["17", "21"]) },
    alone: "",
    agrees: ".java-version",
    clashes: { ".java-version": "25\n" },
  },
];

const agreeing: Record<string, string> = { ruby: "3.2.1\n", go: "1.22.0\n", java: "21\n" };

for (const item of cases) {
  void test(`${item.name}: a matrix is a set of alternatives, not drift`, async () => {
    const alone = (await analyzeDrift(await repo(item.files), [item.collector])).runtimes[0]!;
    assert.equal(alone.drifted, false, "a matrix alone");

    const agrees = await repo({ ...item.files, [item.agrees]: agreeing[item.name]! });
    assert.equal((await analyzeDrift(agrees, [item.collector])).runtimes[0]!.drifted, false, "a pin inside the matrix");

    const clashes = await repo({ ...item.files, ...item.clashes });
    assert.equal(
      (await analyzeDrift(clashes, [item.collector])).runtimes[0]!.drifted,
      true,
      "a pin outside the matrix",
    );
  });
}
