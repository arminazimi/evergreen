import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { parse } from "yaml";

const execute = promisify(execFile);
const read = (path: string) => readFile(resolve(path), "utf8");

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  permissions?: Record<string, string>;
  steps: Step[];
}

const release = parse(await read(".github/workflows/release.yml")) as {
  on: { push?: { branches?: string[]; tags?: string[] }; workflow_dispatch?: unknown };
  jobs: Record<string, { if?: string; uses?: string; with?: Record<string, unknown>; permissions?: Record<string, string> }>;
};
const buildAction = parse(await read(".github/workflows/release-build-action.yml")) as {
  jobs: Record<string, Job>;
};
const publish = parse(await read(".github/workflows/publish.yml")) as {
  jobs: { publish: { steps: Step[] } };
};

const bundle = buildAction.jobs["action-bundle"]!;
const bundleSteps = bundle.steps.map((step) => step.run ?? step.uses ?? "").join("\n");

test("the Release workflow builds the Action bundle only when main gains a version", () => {
  // The bundle is no longer committed, so it is built where it is needed: on the release branch,
  // after the release commit lands on main. Every other job filters by event and ignores this push.
  assert.deepEqual(release.on.push?.branches, ["main"]);
  assert.match(release.jobs["build-action"]!.if ?? "", /github\.event_name == 'push'/);
  assert.match(release.jobs["build-action"]!.if ?? "", /refs\/heads\/main/);
  assert.equal(release.jobs["build-action"]!.uses, "./.github/workflows/release-build-action.yml");
  assert.deepEqual(bundle.permissions, { contents: "write" }, "the job pushes the release branch and nothing else");
  assert.match(bundleSteps, /npm run build:action/);
  assert.match(bundleSteps, /git add --force dist\/action/, "dist/ is ignored on main, so the bundle is added by force");
  assert.match(bundleSteps, /git push origin "HEAD:refs\/heads\/release\/v\$VERSION"/);
  assert.match(bundleSteps, /git tag -a .*v\$VERSION/, "the job summary prints the tagging command");
  assert.match(bundleSteps, /git ls-remote --tags .*"refs\/tags\/v\$version"/, "a version that is already tagged is left alone");
});

test("the publish guard accepts only the release branch tip that adds the bundle", async (t) => {
  // Windows runners have no bash; the guard runs as a bash step on Linux.
  if (process.platform === "win32") return t.skip("the guard is a bash step");

  const step = publish.jobs.publish.steps.find(
    (candidate) => candidate.name === "The tag must point at a release branch tip that adds the Action bundle",
  );
  assert.ok(step?.run, "publish.yml has the release branch guard");
  const guard = step!.run!;
  assert.match(guard, /git merge-base --is-ancestor "\$parent" origin\/main/, "the release commit is on main");
  assert.match(guard, /git diff --name-only "\$parent" "\$GITHUB_SHA"/, "only the bundle may differ from main");
  assert.match(guard, /\[ ! -f dist\/action\/index.js \]/, "the tag must ship the bundle");

  const checkout = publish.jobs.publish.steps.find((candidate) => candidate.uses?.startsWith("actions/checkout"));
  assert.equal(checkout?.with?.["fetch-depth"], 0, "the guard needs the parent commit");

  const root = await mkdtemp(join(tmpdir(), "evergreen-release-guard-"));
  try {
    const origin = join(root, "origin.git");
    const work = join(root, "work");
    await execute("git", ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
    await execute("git", ["clone", "--quiet", origin, work]);
    const git = async (...args: string[]) => (await execute("git", args, { cwd: work })).stdout.trim();
    const commit = async (message: string) => {
      await git("add", "--all", "--force");
      await git("commit", "--quiet", "-m", message);
      return git("rev-parse", "HEAD");
    };
    const write = async (path: string, content: string) => {
      await mkdir(join(work, path, ".."), { recursive: true });
      await writeFile(join(work, path), content);
    };

    await git("config", "user.name", "Evergreen Tests");
    await git("config", "user.email", "tests@example.com");
    await write("package.json", JSON.stringify({ version: "1.2.3" }));
    await write("src/cli.ts", "export const cli = 1;\n");
    const mainSha = await commit("chore: release 1.2.3");
    await git("push", "--quiet", "-u", "origin", "main");

    // The shape the Release workflow produces: one commit on top of main that adds the bundle.
    await git("switch", "--quiet", "-c", "release/v1.2.3");
    await write("dist/action/index.js", "console.log('bundle');\n");
    await write("dist/action/package.json", '{ "type": "module" }\n');
    const tagged = await commit("chore(release): add the Action bundle for v1.2.3");
    await git("push", "--quiet", "-u", "origin", "release/v1.2.3");

    // A release branch that also changes source: reviewed nowhere, so it must not publish.
    await git("switch", "--quiet", "-c", "release/v1.2.4", mainSha);
    await write("src/extra.ts", "export const extra = 1;\n");
    await write("dist/action/index.js", "console.log('bundle');\n");
    const extra = await commit("chore(release): add the Action bundle for v1.2.4");
    await git("push", "--quiet", "-u", "origin", "release/v1.2.4");

    const guardRun = async (sha: string, tag: string) => {
      await git("checkout", "--quiet", "--detach", sha);
      try {
        const result = await execute("bash", ["-eo", "pipefail", "-c", guard], {
          cwd: work,
          env: { ...process.env, GITHUB_SHA: sha, GITHUB_REF_NAME: tag },
        });
        return { code: 0, stderr: result.stderr };
      } catch (error) {
        const failure = error as { code?: number; stderr?: string };
        return { code: failure.code ?? -1, stderr: failure.stderr ?? "" };
      }
    };

    const accepted = await guardRun(tagged, "v1.2.3");
    assert.equal(accepted.code, 0, `the release branch tip publishes: ${accepted.stderr}`);
    const onMain = await guardRun(mainSha, "v1.2.3");
    assert.equal(onMain.code, 1, "a tag on the merge commit is refused, because that tree has no bundle");
    assert.match(onMain.stderr, /is not the tip of release\/v1\.2\.3/);
    const wider = await guardRun(extra, "v1.2.4");
    assert.equal(wider.code, 1, "a release branch that changes source is refused");
    assert.match(wider.stderr, /changes more than the Action bundle/);
    assert.match(wider.stderr, /src\/extra\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the docs describe where the bundle lives now", async () => {
  const releasing = await read("docs/RELEASING.md");
  assert.match(releasing, /## Action bundles on release tags/);
  assert.match(releasing, /release\/vX\.Y\.Z/);
  assert.match(releasing, /git tag -a vX\.Y\.Z -m "vX\.Y\.Z" FETCH_HEAD/);
  assert.match(await read("docs/GITHUB_ACTION.md"), /RELEASING\.md#action-bundles-on-release-tags/);

  const agents = await read("AGENTS.md");
  const row = agents.split("\n").find((line) => line.startsWith("| `dist/action/index.js`"));
  assert.ok(row, "AGENTS.md lists the bundle");
  assert.match(row!, /not committed on `main`/);
  assert.match(row!, /release\/<tag>/);
});
