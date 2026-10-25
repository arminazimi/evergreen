import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

interface Hook {
  id: string;
  entry: string;
  language: string;
  passFilenames: string;
  files: string | undefined;
}

/** Reads the flat `- id:` list in `.pre-commit-hooks.yaml`; the file uses only scalar fields. */
function parseHooks(text: string): Hook[] {
  const hooks: Array<Record<string, string>> = [];
  for (const line of text.split("\n")) {
    const match = /^(- |  )([a-z_]+): (.*)$/.exec(line);
    if (!match) continue;
    if (match[1] === "- ") hooks.push({});
    hooks[hooks.length - 1]![match[2]!] = match[3]!.replace(/^'(.*)'$/, "$1");
  }
  return hooks.map((hook) => ({ id: hook.id!, entry: hook.entry!, language: hook.language!, passFilenames: hook.pass_filenames!, files: hook.files }));
}

const hooks = parseHooks(await readFile(".pre-commit-hooks.yaml", "utf8"));

test("pre-commit hooks define evergreen and evergreen-changed-manifests on Node", () => {
  assert.deepEqual(hooks.map((hook) => hook.id), ["evergreen", "evergreen-changed-manifests"]);
  for (const hook of hooks) {
    assert.equal(hook.language, "node");
    assert.equal(hook.passFilenames, "false");
    assert.match(hook.entry, /^evergreen scan \. --fail-on high/);
  }
});

test("evergreen-changed-manifests triggers on manifests and workflows only", () => {
  const pattern = new RegExp(hooks[1]!.files!);
  for (const path of ["package.json", "web/package-lock.json", ".github/workflows/ci.yml", "requirements-dev.txt", "go.mod", "app/App.csproj"]) {
    assert.ok(pattern.test(path), path);
  }
  for (const path of ["src/index.ts", "README.md", "docs/package.json.md"]) {
    assert.ok(!pattern.test(path), path);
  }
});

test("the documented pre-commit snippet pins a revision of this repository", async () => {
  const docs = await readFile("docs/HOOKS.md", "utf8");
  assert.match(docs, /repo: https:\/\/github\.com\/arminazimi\/evergreen\n\s+rev: v\d+\.\d+\.\d+/);
});
