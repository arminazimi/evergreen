import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { parseDockerfile } from "../src/detectors/container/parse-dockerfile.js";
import { scanRepository } from "../src/engine/index.js";
import { dockerfileLegacyFixer } from "../src/fix/codemods/dockerfile-legacy.js";
import { renderPatches } from "../src/fix/index.js";
import { apply, cleanup, repository } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/dockerfile-legacy");

after(cleanup);

test("rewrites MAINTAINER and the legacy ENV form to the after fixture", async () => {
  const before = await readFile(join(fixtures, "before.image.fixture"), "utf8");
  const after = await readFile(join(fixtures, "after.image.fixture"), "utf8");
  const root = await repository({ Dockerfile: before });
  const patches = await dockerfileLegacyFixer.plan(await scanRepository(root, detectors));

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "Dockerfile");
  const hunk = patches[0]!.diff.split("\n").slice(2);
  const start = Number(/^@@ -(\d+)/.exec(hunk[0]!)![1]) - 1;
  const rebuilt = hunk
    .slice(1)
    .filter((line) => !line.startsWith("-"))
    .map((line) => line.slice(1));
  assert.deepEqual(rebuilt, after.split("\n").slice(start, start + rebuilt.length));
  assert.ok(
    patches[0]!.diff.includes('\n+LABEL org.opencontainers.image.authors="Evergreen Team <team@example.com>"\n'),
  );
  assert.ok(patches[0]!.diff.includes('\n+ENV MULTI="one two"\n'));

  assert.equal(await apply(root, renderPatches(patches), "Dockerfile"), after);

  // The patched file still parses with the container detector's parser, and only the FROM remains a declaration.
  assert.deepEqual(parseDockerfile(after), [{ kind: "image", value: "node:24", line: 2 }]);
});

test("the planned patch is idempotent: scanning the fixed file plans nothing", async () => {
  const root = await repository({ Dockerfile: await readFile(join(fixtures, "after.image.fixture"), "utf8") });
  assert.deepEqual(await dockerfileLegacyFixer.plan(await scanRepository(root, detectors)), []);
});

const refusals = [
  {
    name: "a value with a double quote",
    contents: 'FROM node:24\nENV MESSAGE hello "world"\n',
    line: 2,
    reason: "The value contains a quote, which this codemod does not rewrite safely.",
  },
  {
    name: "a value with a backslash",
    contents: "FROM node:24\nENV PATH C:\\tools\n",
    line: 2,
    reason: "The value contains a backslash, which this codemod does not rewrite safely.",
  },
  {
    name: "a line continuation",
    contents: "FROM node:24\nENV MESSAGE hello \\\nworld\n",
    line: 2,
    reason: "The instruction continues on another line, which this codemod does not rewrite.",
  },
  {
    name: "a heredoc",
    contents: "FROM node:24\nENV SCRIPT <<EOF\n",
    line: 2,
    reason: "The value contains a heredoc, which this codemod does not rewrite.",
  },
  {
    name: "an ONBUILD MAINTAINER trigger",
    contents: "FROM node:24\nONBUILD MAINTAINER Evergreen Team\n",
    line: 2,
    reason: "The instruction is inside an ONBUILD trigger, which this codemod does not rewrite.",
  },
  {
    name: "an ONBUILD ENV trigger",
    contents: "FROM node:24\nONBUILD ENV NODE_ENV production\n",
    line: 2,
    reason: "The instruction is inside an ONBUILD trigger, which this codemod does not rewrite.",
  },
];

for (const refusal of refusals) {
  test(`leaves ${refusal.name} alone and reports why`, async () => {
    const root = await repository({ Dockerfile: refusal.contents });
    const declined: Array<{ line: number | undefined; reason: string }> = [];
    const patches = await dockerfileLegacyFixer.plan(await scanRepository(root, detectors), (finding, reason) =>
      declined.push({ line: finding.location.line, reason }),
    );
    assert.deepEqual(patches, []);
    assert.deepEqual(declined, [{ line: refusal.line, reason: refusal.reason }]);
    assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), refusal.contents);
  });
}
