import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { NpmDetector } from "../src/detectors/npm.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-npm-"));
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

test("reports EOL Node.js ranges and deprecated direct packages from package-lock", async () => {
  const root = await repository({
    "package.json": JSON.stringify(
      {
        engines: { node: "^20.0.0" },
        dependencies: { request: "^2.88.0" },
        devDependencies: { "node-sass": "^9.0.0" },
      },
      null,
      2,
    ),
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "node_modules/request": { version: "2.88.2" },
        "node_modules/node-sass": { version: "9.0.0" },
      },
    }),
    "src/client.ts": `import request from "request";\nrequest.get("https://example.com");\n`,
    "src/styles.js": `const sass = require("node-sass");\nsass.renderSync({ file: "app.scss" });\n`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 3);
  assert.match(findings[0]?.summary ?? "", /Node\.js 20/);
  assert.equal(findings[0]?.severity, "medium");
  assert.match(findings[1]?.summary ?? "", /resolved: 2\.88\.2/);
  assert.match(findings[2]?.summary ?? "", /resolved: 9\.0\.0/);
  const requestFinding = findings.find((finding) => finding.ruleId.includes("request"));
  const sassFinding = findings.find((finding) => finding.ruleId.includes("node-sass"));
  assert.equal(requestFinding?.impact?.usageCount, 2);
  assert.equal(sassFinding?.impact?.usageCount, 2);
  assert.equal(requestFinding?.usages?.[1]?.location.path, "src/client.ts");
});

test("reads pinned runtimes and reports them with higher severity", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ volta: { node: "18.20.0" } }, null, 2),
    ".nvmrc": "20\n",
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => finding.severity === "high"));
  assert.deepEqual(
    findings.map((finding) => finding.location.path).sort(),
    [".nvmrc", "package.json"],
  );
});

test("discovers resolved versions in pnpm and Yarn lockfiles", async () => {
  const root = await repository({
    "package.json": JSON.stringify({
      dependencies: { request: "^2.88.0", "left-pad": "^1.3.0" },
    }),
    "pnpm-lock.yaml": `lockfileVersion: '9.0'\npackages:\n  request@2.88.2: {}\n`,
    "yarn.lock": `left-pad@^1.3.0:\n  version "1.3.0"\n`,
  });

  const findings = await new NpmDetector().scan({ root });

  assert.equal(findings.length, 2);
  assert.ok(findings.some((finding) => finding.summary.includes("resolved: 2.88.2")));
  assert.ok(findings.some((finding) => finding.summary.includes("resolved: 1.3.0")));
});

test("does not report supported Node.js ranges or transitive-only deprecated packages", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ engines: { node: ">=22" } }),
    "package-lock.json": JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/request": { version: "2.88.2" } },
    }),
  });

  const findings = await new NpmDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("stub-type deprecations exclude older typed releases and respect resolved versions", async () => {
  for (const [version, affected] of [["8.1.0", false], ["9.0.0", true]] as const) {
    const root = await repository({
      "package.json": JSON.stringify({ dependencies: { "@types/glob": `^${version}` } }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@types/glob": { version } } }),
    });
    const result = await new NpmDetector().scan({ root });
    assert.equal(result.some((finding) => finding.ruleId === "npm.package.types.glob.deprecated"), affected);
  }
});


test("version-specific npm rules match declared ranges when no lockfile is available", async () => {
  for (const [range, affected] of [["^8.1.0", false], ["^9.0.0", true], ["*", true], ["workspace:*", false]] as const) {
    const root = await repository({ "package.json": JSON.stringify({ dependencies: { "@types/glob": range } }) });
    const findings = await new NpmDetector().scan({ root });
    assert.equal(findings.some((finding) => finding.ruleId === "npm.package.types.glob.deprecated"), affected, range);
  }
});

test("a supported resolved release takes precedence over a broad manifest range", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ dependencies: { "@types/glob": "*" } }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@types/glob": { version: "8.1.0" } } }),
  });
  const findings = await new NpmDetector().scan({ root });
  assert.equal(findings.some((finding) => finding.ruleId === "npm.package.types.glob.deprecated"), false);
});

test("reports the line of the declaration that was matched, in the section it came from", async () => {
  const root = await repository({
    "package.json": [
      "{",
      '  "overrides": {',
      '    "request": "2.88.2"',
      "  },",
      '  "dependencies": {',
      '    "request": "^2.88.0"',
      "  },",
      '  "devDependencies": {',
      '    "request": "^2.88.0"',
      "  }",
      "}",
    ].join("\n"),
  });

  const findings = await new NpmDetector().scan({ root });
  const requestFindings = findings.filter((finding) => finding.ruleId === "npm.package.request.deprecated");

  assert.equal(requestFindings.length, 1);
  assert.equal(requestFindings[0]?.location.line, 9);
  assert.match(requestFindings[0]?.summary ?? "", /declared in devDependencies as \^2\.88\.0/);
});

test("does not report a package declared only as a peer dependency, even when the lockfile resolves it", async () => {
  for (const range of ["*", "^8.0.0 || ^9.0.0"]) {
    const root = await repository({
      "package.json": JSON.stringify({ peerDependencies: { "@types/glob": range } }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "node_modules/@types/glob": { version: "9.0.0" } },
      }),
    });

    const findings = await new NpmDetector().scan({ root });

    assert.deepEqual(
      findings.filter((finding) => finding.ruleId === "npm.package.types.glob.deprecated"),
      [],
      range,
    );
  }
});

test("a package in dependencies and peerDependencies reports the dependencies line", async () => {
  const root = await repository({
    "package.json": [
      "{",
      '  "peerDependencies": {',
      '    "@types/glob": "*"',
      "  },",
      '  "dependencies": {',
      '    "@types/glob": "^9.0.0"',
      "  }",
      "}",
    ].join("\n"),
  });

  const findings = await new NpmDetector().scan({ root });
  const globFindings = findings.filter((finding) => finding.ruleId === "npm.package.types.glob.deprecated");

  assert.equal(globFindings.length, 1);
  assert.equal(globFindings[0]?.location.line, 6);
  assert.match(globFindings[0]?.summary ?? "", /declared in dependencies as \^9\.0\.0/);
});
