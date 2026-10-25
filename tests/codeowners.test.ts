import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { groupByOwner, groupScanByOwner, ownersOf, parseCodeowners, renderOwnerGroupsText } from "../src/codeowners.js";
import type { Finding } from "../src/domain.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(path: string): Finding {
  return { id: `f:${path}`, ruleId: "nodejs.runtime.eol-18", detector: "d", title: `Problem in ${path}`, summary: "s", severity: "high", confidence: "exact", location: { path, line: 3 }, sources: [] };
}

const rules = parseCodeowners(`
# comment
*                 @org/default
*.js              @org/frontend
/docs/            @org/docs  # trailing comment
apps/**/package.json @org/apps @alice
/legacy/*         @org/legacy
/legacy/keep.txt
`);

test("the last matching rule wins and patterns follow gitignore anchoring", () => {
  assert.deepEqual(ownersOf(rules, "README.md"), ["@org/default"]);
  assert.deepEqual(ownersOf(rules, "web/src/index.js"), ["@org/frontend"]);
  assert.deepEqual(ownersOf(rules, "docs/a/b.md"), ["@org/docs"]);
  assert.deepEqual(ownersOf(rules, "site/docs/a.md"), ["@org/default"]);
  assert.deepEqual(ownersOf(rules, "apps/api/v2/package.json"), ["@org/apps", "@alice"]);
  assert.deepEqual(ownersOf(rules, "apps/package.json"), ["@org/apps", "@alice"]);
  assert.deepEqual(ownersOf(rules, "legacy/a.txt"), ["@org/legacy"]);
  assert.deepEqual(ownersOf(rules, "legacy/deep/a.txt"), ["@org/default"]);
});

test("a rule with no owners clears ownership", () => {
  assert.deepEqual(ownersOf(rules, "legacy/keep.txt"), []);
});

test("no rules means no owners", () => {
  assert.deepEqual(ownersOf([], "package.json"), []);
});

test("groupByOwner lists files with no owner explicitly", () => {
  const groups = groupByOwner({ root: "/x", findings: [finding("apps/api/package.json"), finding("a.js"), finding("legacy/keep.txt")] }, rules, "CODEOWNERS");
  assert.deepEqual(groups.owners.map((group) => [group.owner, group.findings.length]), [["@alice", 1], ["@org/apps", 1], ["@org/frontend", 1]]);
  assert.deepEqual(groups.unowned.map((item) => item.location.path), ["legacy/keep.txt"]);
  assert.match(renderOwnerGroupsText(groups), /Unowned \(1\)/);
});

test("without a CODEOWNERS file every finding is unowned", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-owners-"));
  roots.push(root);
  const groups = await groupScanByOwner({ root, findings: [finding("package.json")] });
  assert.equal(groups.codeowners, null);
  assert.equal(groups.unowned.length, 1);
  assert.match(renderOwnerGroupsText(groups), /none found/);
});

test("scan --by-owner groups a real scan by CODEOWNERS", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-owners-"));
  roots.push(root);
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", engines: { node: "18" }, dependencies: { request: "2.88.2" } }));
  await mkdir(dirname(join(root, ".github/CODEOWNERS")), { recursive: true });
  await writeFile(join(root, ".github/CODEOWNERS"), "package.json @org/platform\n");
  const { stdout } = await execute("node", [cli, "scan", root, "--by-owner", "--json"]);
  const groups = JSON.parse(stdout);
  assert.equal(groups.schemaVersion, "evergreen.owners.v1");
  assert.equal(groups.codeowners, ".github/CODEOWNERS");
  assert.deepEqual(groups.owners.map((group: { owner: string }) => group.owner), ["@org/platform"]);
  assert.deepEqual(groups.unowned, []);
  const text = await execute("node", [cli, "scan", root, "--by-owner"]);
  assert.match(text.stdout, /@org\/platform \(\d+\)/);
});
