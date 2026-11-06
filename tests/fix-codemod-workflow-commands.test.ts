import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseDocument } from "yaml";

import { githubActionsDetector } from "../src/detectors/github-actions.js";
import { scanRepository } from "../src/engine/index.js";
import { planFixReport, renderPatches, workflowCommandsFixer } from "../src/fix/index.js";
import { applyDiff as apply, repository as temporaryRepository } from "./codemod-helpers.js";

const path = ".github/workflows/ci.yml";
const prefix = "github-actions.workflow-command.";

/** Writes the workflow at the given path and returns the temporary repository. */
function repository(contents: string, file = path): Promise<string> {
  return temporaryRepository({ [file]: contents });
}

function workflow(
  script: string,
  stepShell = "bash",
  defaults = "",
  jobDefaults = "",
  runner = "ubuntu-latest",
): string {
  return `${defaults}jobs:\n  test:\n    runs-on: ${runner}\n${jobDefaults}    steps:\n      - run: ${JSON.stringify(script)}\n${stepShell ? `        shell: ${stepShell}\n` : ""}`;
}

async function report(root: string) {
  return planFixReport(await scanRepository(root, [githubActionsDetector]), [workflowCommandsFixer]);
}

test("each command and quoting style produces applicable, parseable, idempotent patches without writing during planning", async () => {
  for (const [command, env] of [
    ["set-output", "OUTPUT"],
    ["save-state", "STATE"],
    ["set-env", "ENV"],
    ["add-path", "PATH"],
  ]) {
    for (const quote of ['"', "'", ""]) {
      const body = command === "add-path" ? "::add-path::/opt/bin" : `::${command} name=NAME::value`;
      const before = workflow(`echo ${quote}${body}${quote}`);
      const root = await repository(before);
      const plan = await report(root);
      assert.deepEqual(plan.refusals, []);
      assert.equal(plan.patches.length, 1);
      assert.equal(await readFile(join(root, path), "utf8"), before);
      await apply(root, renderPatches(plan.patches));
      const fixed = await readFile(join(root, path), "utf8");
      const doc = parseDocument(fixed);
      assert.deepEqual(doc.errors, []);
      const outputQuote = quote || '"';
      assert.equal(
        doc.getIn(["jobs", "test", "steps", 0, "run"]),
        `echo ${outputQuote}${command === "add-path" ? "/opt/bin" : "NAME=value"}${outputQuote} >> "$GITHUB_${env}"`,
      );
      assert.deepEqual(await report(root), { patches: [], refusals: [] });
    }
  }
});

test("literal block fixture rewrites all commands and matches the after file", async () => {
  const fixture = resolve("tests/fixtures/fix/workflow-commands");
  const root = await repository(await readFile(join(fixture, "before.workflow.fixture"), "utf8"));
  const plan = await report(root);
  assert.equal(plan.patches.length, 1);
  assert.deepEqual(plan.refusals, []);
  await apply(root, renderPatches(plan.patches));
  assert.equal(
    await readFile(join(root, path), "utf8"),
    await readFile(join(fixture, "after.workflow.fixture"), "utf8"),
  );
  assert.deepEqual(await report(root), { patches: [], refusals: [] });
});

test("shell precedence is step, job, workflow, then the known runner default", async () => {
  const cases = [
    ["sh", "defaults:\n  run:\n    shell: pwsh\n", "    defaults:\n      run:\n        shell: cmd\n", "windows-latest"],
    ["", "defaults:\n  run:\n    shell: pwsh\n", "    defaults:\n      run:\n        shell: bash\n", "windows-latest"],
    ["", "defaults:\n  run:\n    shell: sh\n", "", "windows-latest"],
    ["", "", "", "ubuntu-latest"],
    ["", "", "", "macos-14"],
  ];
  for (const [shell, defaults, job, runner] of cases) {
    const root = await repository(workflow('echo "::set-output name=X::v"', shell, defaults, job, runner));
    assert.equal((await report(root)).patches.length, 1);
  }
  for (const shell of ["pwsh", "powershell", "cmd", "bash {0}", "python", "${{ inputs.shell }}"]) {
    const root = await repository(workflow('echo "::set-output name=X::v"', shell));
    const plan = await report(root);
    assert.equal(plan.patches.length, 0);
    assert.match(plan.refusals[0]?.reason ?? "", /shell/);
  }
  for (const runner of ["windows-latest", "self-hosted", "${{ matrix.os }}"]) {
    const root = await repository(workflow('echo "::set-output name=X::v"', "", "", "", runner));
    assert.match((await report(root)).refusals[0]?.reason ?? "", /shell/);
  }
});

test("unsafe values and shell shapes stay manual with reasons", async () => {
  const scripts = [
    'echo "::set-output name=X::a%0Ab"',
    'echo "::set-output name=X::a%0Db"',
    'echo "::set-output name=X::a%25b"',
    'echo "::set-output name=X::a%0ab"',
    'echo "::set-output name=X::a\\\"b"',
    'echo "::set-output name=X::a\nb"',
    'echo "::set-output name=X::$(date)"',
    'echo "::set-output name=X::`date`"',
    'echo "::set-output name=X::${{ inputs.value }}"',
    'echo -n "::set-output name=X::v"',
    'printf "::set-output name=X::v"',
    'echo "::set-output name=X::v" >> output',
    'echo "::set-output name=X::v"; echo done',
    "echo ::set-output name=X::$value",
    "echo ::set-output name=X::a b",
    'echo "::set-output name=bad name::v"',
    'echo "::add-path::-n"',
    'cat <<EOF\necho "::set-output name=X::v"\nEOF',
    'echo \\\n"::set-output name=X::v"',
  ];
  for (const script of scripts) {
    const root = await repository(workflow(script));
    const findings = await githubActionsDetector.scan({ root });
    assert.ok(findings.length > 0, script);
    const plan = await report(root);
    assert.deepEqual(plan.patches, [], script);
    assert.equal(plan.refusals.length, findings.length, script);
    assert.ok(
      plan.refusals.every((refusal) => refusal.reason.length > 0),
      script,
    );
  }
});

test("composite action run steps are detected and rewritten, but JavaScript action metadata is ignored", async () => {
  for (const file of ["action.yml", "local/action.yaml"]) {
    const before = 'runs:\n  using: composite\n  steps:\n    - run: echo "::save-state name=X::v"\n      shell: sh\n';
    const root = await repository(before, file);
    const findings = await githubActionsDetector.scan({ root });
    assert.equal(findings[0]?.ruleId, `${prefix}save-state`);
    assert.deepEqual(findings[0]?.location, { path: file, line: 4 });
    const plan = await report(root);
    assert.equal(plan.patches.length, 1);
    await apply(root, renderPatches(plan.patches));
    assert.deepEqual(parseDocument(await readFile(join(root, file), "utf8")).errors, []);
    assert.deepEqual(await report(root), { patches: [], refusals: [] });
  }
  const root = await repository(
    'runs:\n  using: node24\n  steps:\n    - run: echo "::save-state name=X::v"\n',
    "action.yml",
  );
  assert.deepEqual(await githubActionsDetector.scan({ root }), []);
});

test("detection reports physical lines only inside actual run scalars, excluding comments and non-run values", async () => {
  const root = await repository(`name: '::set-output name=X::ignored'
env:
  MESSAGE: '::save-state name=X::ignored'
jobs:
  test:
    steps:
      - name: '::set-env name=X::ignored'
        run: |
          # echo "::set-output name=X::ignored"
          echo safe # ::add-path::ignored
          echo "::set-output name=X::yes"
          echo '::save-state name=X::yes'
      - run: echo "::add-path::/opt/bin"
      - run: >-
          echo "::set-env name=X::manual"
        shell: bash
      - run: 123
      - uses: owner/action@v1
        with:
          run: '::set-output name=X::ignored'
`);
  const findings = await githubActionsDetector.scan({ root });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.line]),
    [
      [`${prefix}set-output`, 11],
      [`${prefix}save-state`, 12],
      [`${prefix}add-path`, 13],
      [`${prefix}set-env`, 15],
    ],
  );
  const plan = await report(root);
  assert.match(plan.refusals.find((item) => item.line === 15)?.reason ?? "", /Folded/);
});

test("malformed YAML and unrelated files are ignored", async () => {
  for (const [file, contents] of [
    [path, 'jobs: [broken\nrun: echo "::set-output name=X::v"\n'],
    ["notes.yml", workflow('echo "::set-output name=X::v"')],
  ]) {
    const root = await repository(contents ?? "", file);
    assert.deepEqual(await githubActionsDetector.scan({ root }), []);
  }
});

test("stale findings, changed replacements and invalid files are refused", async () => {
  const root = await repository(workflow('echo "::set-output name=X::v"'));
  const result = await scanRepository(root, [githubActionsDetector]);
  const finding = result.findings[0];
  assert.ok(finding);
  for (const changed of [
    { ...finding, location: { path, line: 99 } },
    { ...finding, location: { path } },
    { ...finding, replacement: "other" },
    { ...finding, location: { path: "../outside/action.yml", line: 1 } },
    { ...finding, location: { path: "missing/action.yml", line: 1 } },
  ]) {
    const plan = await planFixReport({ ...result, findings: [changed] }, [workflowCommandsFixer]);
    assert.equal(plan.patches.length, 0);
    assert.equal(plan.refusals.length, 1);
  }
  await writeFile(join(root, path), workflow('echo "::set-output name=X::v"').trimEnd());
  assert.equal((await planFixReport(result, [workflowCommandsFixer])).refusals.length, 1);
  await writeFile(join(root, path), workflow('echo "already migrated"'));
  assert.match((await planFixReport(result, [workflowCommandsFixer])).refusals[0]?.reason ?? "", /no longer/);
});

test("the standard fixer report owns each workflow-command finding once", async () => {
  const root = await repository(workflow('echo "::set-output name=X::v"'));
  const plan = await planFixReport(await scanRepository(root, [githubActionsDetector]));
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(
    plan.patches.map((patch) => patch.fixer),
    ["workflow-commands"],
  );
});

test("CRLF, YAML quotes and comments survive scalar replacement", async () => {
  const before = `jobs:
  test:
    steps:
      - run: 'echo "::set-output name=X::$VALUE"' # YAML comment
        shell: bash
      - run: |
          echo '::save-state name=X::$VALUE'
        shell: sh
`.replaceAll("\n", "\r\n");
  const root = await repository(before);
  const plan = await report(root);
  assert.equal(plan.patches.length, 1);
  assert.deepEqual(plan.refusals, []);
  await apply(root, renderPatches(plan.patches));
  const fixed = await readFile(join(root, path), "utf8");
  assert.ok(fixed.includes("# YAML comment\r\n"));
  assert.equal(fixed.replaceAll("\r\n", "").includes("\n"), false);
  const document = parseDocument(fixed);
  assert.deepEqual(document.errors, []);
  assert.equal(document.getIn(["jobs", "test", "steps", 0, "run"]), 'echo "X=$VALUE" >> "$GITHUB_OUTPUT"');
  assert.equal(document.getIn(["jobs", "test", "steps", 1, "run"]), "echo 'X=$VALUE' >> \"$GITHUB_STATE\"\n");
  assert.deepEqual(await report(root), { patches: [], refusals: [] });
});

test("dynamic add-path values cannot become echo options", async () => {
  const root = await repository(workflow('echo "::add-path::$PATH_VALUE"'));
  const plan = await report(root);
  assert.deepEqual(plan.patches, []);
  assert.match(plan.refusals[0]?.reason ?? "", /echo option/);
});
