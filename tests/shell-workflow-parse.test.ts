import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseWorkflow } from "../src/detectors/shell/parse-workflow.js";

const fixture = (name: string) => readFile(`tests/fixtures/shell/${name}/.github/workflows/ci.yml`, "utf8");
const shell = (value: string, line: number) => ({ kind: "shell", value, line });
const image = (product: string, value: string, line: number) => ({ kind: "image", product, value, line });

test("the positive workflow fixture reports shells and pinned images with exact lines", async () => {
  assert.deepEqual(parseWorkflow(await fixture("positive")), [
    shell("pwsh", 9),
    image("powershell", "7.4-ubuntu-22.04", 14),
    shell("pwsh", 18),
    image("bash", "5.2", 23),
    shell("bash", 27),
  ]);
});

test("the zero fixture reports its declarations", async () => {
  assert.deepEqual(parseWorkflow(await fixture("zero")), [image("powershell", "7.5-ubuntu-24.04", 7), shell("pwsh", 11)]);
});

test("negative and malformed fixtures yield nothing and do not throw", async () => {
  assert.deepEqual(parseWorkflow(await fixture("negative")), []);
  assert.deepEqual(parseWorkflow(await fixture("malformed")), []);
});

test("defaults.run.shell is read at workflow and job level", () => {
  const input = ["defaults:", "  run:", "    shell: bash", "jobs:", "  a:", "    defaults:", "      run:", "        shell: pwsh", "    steps: []"].join("\n");
  assert.deepEqual(parseWorkflow(input), [shell("bash", 3), shell("pwsh", 8)]);
});

test("string container and service images are read", () => {
  const input = ["jobs:", "  a:", "    container: bash:5.2", "    services:", "      s:", "        image: mcr.microsoft.com/powershell:7.4", "    steps: []"].join("\n");
  assert.deepEqual(parseWorkflow(input), [image("bash", "5.2", 3), image("powershell", "7.4", 6)]);
});

test("dynamic, untagged, lookalike and unrelated images are ignored", () => {
  for (const ref of ["${{ inputs.image }}", "bash", "mcr.microsoft.com/powershell", "ghcr.io/org/bash:5.2", "mcr.microsoft.com/dotnet/sdk:8.0", "bash@sha256:" + "a".repeat(64), "${IMAGE}:5.2"]) {
    const input = `jobs:\n  a:\n    container:\n      image: ${JSON.stringify(ref)}\n    steps: []`;
    assert.deepEqual(parseWorkflow(input), [], ref);
  }
});

test("expression shells, non-string shells, env keys and comments are ignored", () => {
  const input = ["jobs:", "  a:", "    env:", "      shell: pwsh", "    steps:", "      - shell: ${{ matrix.shell }}", "        run: x", "      - shell: [pwsh]", "        run: x", "      # shell: pwsh", "      - run: y"].join("\n");
  assert.deepEqual(parseWorkflow(input), []);
});

test("aliases, invalid YAML, non-map documents and oversized input yield nothing", () => {
  assert.deepEqual(parseWorkflow("x: &a pwsh\njobs:\n  a:\n    steps:\n      - shell: *a"), []);
  assert.deepEqual(parseWorkflow("jobs: [\n  - shell: pwsh"), []);
  assert.deepEqual(parseWorkflow("- shell: pwsh"), []);
  assert.deepEqual(parseWorkflow(""), []);
  assert.deepEqual(parseWorkflow("#".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
});

test("custom shell templates are kept as written", () => {
  assert.deepEqual(parseWorkflow("jobs:\n  a:\n    steps:\n      - shell: bash -e {0}\n        run: x"), [shell("bash -e {0}", 4)]);
});
