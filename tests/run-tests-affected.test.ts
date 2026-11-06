import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { parse as parseYaml } from "yaml";

// The runner is JavaScript with no type declarations; the dynamic import keeps its exports untyped,
// as tests/run-tests-sharding.test.ts already does for the sharding helpers.
const runner = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
const ENV = runner.AFFECTED_FILES_ENV;

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-affected-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const FILES = {
  "src/a.ts": `import { b } from "./b.js";\nexport const a = b;\n`,
  "src/b.ts": `export const b = 1;\n`,
  "tests/a.test.ts": `import { a } from "../src/a.js";\nexport const value = a;\n`,
  "tests/b.test.ts": `import { b } from "../src/b.js";\nexport const value = b;\n`,
};

async function project(): Promise<{ root: string; compiled: string[]; changed: string }> {
  const root = await tree(FILES);
  const compiled = [resolve(root, "dist/tests/a.test.js"), resolve(root, "dist/tests/b.test.js")];
  for (const file of compiled) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "");
  }
  return { root, compiled, changed: join(root, "changed-files.txt") };
}

async function withList(project_: Awaited<ReturnType<typeof project>>, list: string) {
  await writeFile(project_.changed, list);
  return runner.affectedTestFiles(project_.compiled, { root: project_.root, env: { [ENV]: project_.changed } });
}

test("a pull-request change list narrows the compiled files that run", async () => {
  const project_ = await project();
  const result = await withList(project_, "src/b.ts\n");
  assert.equal(result.full, false);
  assert.deepEqual(result.files, [project_.compiled[0], project_.compiled[1]]);
  assert.match(result.reason, /2 of 2 compiled file/);

  await writeFile(project_.changed, "tests/b.test.ts\n");
  const testOnly = await runner.affectedTestFiles(project_.compiled, {
    root: project_.root,
    env: { [ENV]: project_.changed },
  });
  assert.deepEqual(testOnly.files, [project_.compiled[1]]);
});

test("a shared path in the change list keeps the whole suite", async () => {
  const project_ = await project();
  const result = await withList(project_, "package.json\n");
  assert.equal(result.full, true);
  assert.deepEqual(result.files, project_.compiled);
  assert.match(result.reason, /full suite — package\.json is a shared path/);
});

test("no list, an unreadable list, or coverage all keep the whole suite", async () => {
  const project_ = await project();
  assert.equal(await runner.affectedTestFiles(project_.compiled, { root: project_.root, env: {} }), undefined);

  const missing = await runner.affectedTestFiles(project_.compiled, {
    root: project_.root,
    env: { [ENV]: join(project_.root, "missing.txt") },
  });
  assert.equal(missing.full, true);
  assert.match(missing.reason, /cannot read the change list/);

  await writeFile(project_.changed, "src/b.ts\n");
  const covered = await runner.affectedTestFiles(project_.compiled, {
    root: project_.root,
    env: { [ENV]: project_.changed, EVERGREEN_CHECK_COVERAGE: "1" },
  });
  assert.equal(covered.full, true);
  assert.match(covered.reason, /coverage is measured on every test file/);
});

test("ci.yml sets the change list on pull requests only, and coverage never narrows", async () => {
  const workflow = parseYaml(await readFile(".github/workflows/ci.yml", "utf8"));
  const checkStepEnv = (job: string) => {
    const steps: Array<{ name?: string; env?: Record<string, string> | null }> = workflow.jobs[job].steps;
    return steps.find((step) => step.name === "npm run check")?.env ?? {};
  };
  for (const job of ["check", "check-cross-os"]) {
    assert.match(checkStepEnv(job).EVERGREEN_AFFECTED_FILES ?? "", /github\.event_name == 'pull_request'/, job);
  }
  const coverageSteps: Array<{ env?: Record<string, string> | null }> = workflow.jobs.coverage.steps;
  for (const step of coverageSteps) {
    assert.equal(step.env?.EVERGREEN_AFFECTED_FILES, undefined, "coverage must measure the whole suite");
  }
});
