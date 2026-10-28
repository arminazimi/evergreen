import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { declaresInput } from "../src/detector-inputs.js";
import { NpmDetector, npmDetector } from "../src/detectors/npm.js";
import { scanRepository } from "../src/engine.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-npm-bun-"));
  temporaryRoots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const absolutePath = join(root, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
  return root;
}

test("declares bun.lock and bun.lockb as detector inputs", () => {
  assert.ok(declaresInput(npmDetector.inputs, "bun.lock"));
  assert.ok(declaresInput(npmDetector.inputs, "bun.lockb"));
  assert.ok(declaresInput(npmDetector.inputs, "packages/api/bun.lock"));
  assert.ok(declaresInput(npmDetector.inputs, "packages/api/bun.lockb"));
});

test("a fixture with a deprecated package pinned in bun.lock produces a finding", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "sample-project",
      "dependencies": {
        "request": "^2.88.0",
      },
    },
  },
  "packages": {
    "request": [
      "request@2.88.2",
      "",
      {
        "dependencies": {
          "qs": "~6.5.2",
        },
      },
      "sha512-test-hash",
    ],
  },
}
`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "npm.package.request.deprecated");
  assert.equal(findings[0]?.location.path, "package.json");
  assert.match(findings[0]?.summary ?? "", /resolved: 2\.88\.2/);
  assert.equal(findings[0]?.confidence, "inferred-from-lock");
});

test("bun.lock resolves transitive dependencies and builds dependency paths", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { "my-wrapper": "^1.0.0" },
    }),
    "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "transitive-project",
      "dependencies": {
        "my-wrapper": "^1.0.0",
      },
    },
  },
  "packages": {
    "my-wrapper": [
      "my-wrapper@1.0.0",
      "",
      {
        "dependencies": {
          "request": "^2.88.0",
        },
      },
      "sha512-wrapper-hash",
    ],
    "request": [
      "request@2.88.2",
      "",
      {},
      "sha512-request-hash",
    ],
  },
}
`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "npm.package.request.deprecated");
  assert.deepEqual(findings[0]?.dependencyPath, ["my-wrapper", "request"]);
  assert.match(findings[0]?.summary ?? "", /my-wrapper .* pulls it in; resolved: 2\.88\.2/);
  assert.equal(findings[0]?.confidence, "inferred-from-lock");
});

test("bun.lock handles scoped packages and respects resolved versions", async () => {
  for (const [version, affected] of [["8.1.0", false], ["9.0.0", true]] as const) {
    const root = await repository({
      "package.json": JSON.stringify({
        dependencies: { "@types/glob": `^${version}` },
      }),
      "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "dependencies": {
        "@types/glob": "^${version}",
      },
    },
  },
  "packages": {
    "@types/glob": [
      "@types/glob@${version}",
      "",
      {},
      "sha512-glob-hash",
    ],
  },
}
`,
    });

    const findings = await new NpmDetector().scan({ root });
    assert.equal(findings.some((finding) => finding.ruleId === "npm.package.types.glob.deprecated"), affected);
  }
});

test("bun.lock handles aliased npm: entries", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "dependencies": {
        "request": "npm:request@^2.88.0",
      },
    },
  },
  "packages": {
    "request": [
      "request@npm:2.88.2",
      "",
      {},
      "sha512-alias-hash",
    ],
  },
}
`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "npm.package.request.deprecated");
  assert.match(findings[0]?.summary ?? "", /resolved: 2\.88\.2/);
  assert.equal(findings[0]?.confidence, "inferred-from-lock");
});

test("bun.lock with line and block comments parses correctly", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "bun.lock": `// Bun lockfile v1
// Generated by bun install
{
  /* metadata block */
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      // Direct dependencies for root workspace
      "dependencies": {
        "request": "^2.88.0",
      },
    },
  },
  /* resolved packages dictionary */
  "packages": {
    "request": [
      "request@2.88.2", // exact locked release
      "",
      {
        /* sub-dependencies */
        "dependencies": {},
      },
      "sha512-comment-test-hash",
    ],
  },
}
`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "npm.package.request.deprecated");
  assert.match(findings[0]?.summary ?? "", /resolved: 2\.88\.2/);
  assert.equal(findings[0]?.confidence, "inferred-from-lock");
});

test("bun.lockb produces a clear diagnostic instead of guessing", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "bun.lockb": "\x00bun-lockb-binary-data\x01\x02\x03",
  });

  const analysis = await new NpmDetector().analyze({ root });

  assert.equal(analysis.unclassified.length, 1);
  const item = analysis.unclassified[0]!;
  assert.equal(item.component, "bun.lockb");
  assert.equal(item.reference, "bun.lockb");
  assert.equal(item.location.path, "bun.lockb");
  assert.equal(item.location.line, 1);
  assert.match(item.reason, /binary.*bun\.lockb|bun\.lockb.*binary/i);
  assert.match(item.reason, /bun install/i);

  // scanRepository includes the diagnostic in unclassified references and unsupportedFiles
  const result = await scanRepository(root, [npmDetector]);
  assert.equal(result.unclassified?.count, 1);
  assert.equal(result.unclassified?.references[0]?.location.path, "bun.lockb");
});

test("bun.lockb in workspace produces a diagnostic with the workspace path", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      workspaces: ["packages/*"],
    }),
    "packages/app/package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "packages/app/bun.lockb": "\x00bun-lockb\x01",
  });

  const analysis = await new NpmDetector().analyze({ root });

  assert.ok(analysis.unclassified.some((ref) => ref.location.path === "packages/app/bun.lockb"));
  const item = analysis.unclassified.find((ref) => ref.location.path === "packages/app/bun.lockb")!;
  assert.equal(item.component, "bun.lockb");
  assert.equal(item.location.line, 1);
});

test("malformed bun.lock does not throw and falls back safely", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0" },
    }),
    "bun.lock": "not valid json {",
  });

  const findings = await new NpmDetector().scan({ root });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.confidence, "range");
  assert.match(findings[0]?.summary ?? "", /not found in a supported lockfile/);
});
