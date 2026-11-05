import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const scriptPath = resolve(".github/scripts/release-notes.mjs");
const writerPath = resolve(".github/scripts/write-release-notes.sh");
const script = (await import(pathToFileURL(scriptPath).href)) as {
  releaseSection(tag: string, text: string): string;
  releaseBody(tag: string, text: string): string;
};
const changelog =
  "# Changelog\n\n## 1.2.3 - 2026-11-05\n\n### Fixed\n\n- Fix it.\n\n## 1.2.2 - 2026-11-04\n\n- Older.\n";

test("extracts first and last sections and stops at the next level-two heading", () => {
  assert.equal(script.releaseSection("v1.2.3", changelog), "### Fixed\n\n- Fix it.");
  assert.equal(script.releaseSection("v1.2.2", changelog), "- Older.");
  assert.equal(script.releaseSection("v1.2.2", changelog.replace(/\n/g, "\r\n")), "- Older.");
  assert.equal(script.releaseSection("v1.2.3", `## Unreleased\n\n- Future.\n\n${changelog}`), "### Fixed\n\n- Fix it.");
});

test("rejects missing and empty stable sections, invalid tags and prefix matches", () => {
  for (const tag of ["v1.2.0", "v1.2.30"]) {
    assert.throws(() => script.releaseSection(tag, changelog), /Missing changelog section/);
  }
  for (const text of ["## 1.2.3 - 2026-11-05", "## 1.2.3 - 2026-11-05\n \n## Older\n- old"]) {
    assert.throws(() => script.releaseSection("v1.2.3", text), /Empty changelog section/);
  }
  assert.throws(() => script.releaseSection("main", changelog), /Invalid release tag/);
});

test("pre-releases use their own section or a short note without falling back to stable notes", () => {
  assert.match(script.releaseSection("v1.2.3-rc.1", changelog), /^Pre-release v1.2.3-rc.1/);
  const rc = "## 1.2.3-rc.1 - 2026-11-05\n\n- Candidate.\n";
  assert.equal(script.releaseSection("v1.2.3-rc.1", rc), "- Candidate.");
  assert.throws(() => script.releaseSection("v1.2.3-rc.1", "## 1.2.3-rc.1 - 2026-11-05\n"), /Empty/);
});

test("body includes exact pins, checksum verification, tagged attestation docs and the section link", () => {
  const body = script.releaseBody("v1.2.3", changelog);
  assert.match(body, /`npx evergreen-deprecation@1\.2\.3`/);
  assert.match(body, /`arminazimi\/evergreen@v1\.2\.3`/);
  assert.match(body, /`sha256sum -c SHA256SUMS`/);
  assert.ok(body.includes("/blob/v1.2.3/docs/RELEASING.md#standalone-binaries"));
  assert.ok(body.includes("/blob/v1.2.3/CHANGELOG.md#123---2026-11-05"));
  assert.ok(body.includes("### Fixed\n\n- Fix it."));
  assert.doesNotMatch(body, /Older/);
});

test("CLI prints section text and fails with actionable errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-notes-cli-"));
  try {
    const file = join(dir, "CHANGELOG.md");
    await writeFile(file, changelog);
    const run = (...args: string[]) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
    assert.equal(run("v1.2.3", file).stdout, "### Fixed\n\n- Fix it.\n");
    assert.equal(run("v1.2.3", file, "--body").stdout, script.releaseBody("v1.2.3", changelog));
    assert.equal(run("v9.9.9", file).status, 1);
    assert.match(run("v9.9.9", file).stderr, /Missing changelog section/);
    assert.equal(run("v1.2.3", join(dir, "missing")).status, 1);
    assert.match(run().stderr, /Usage/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Real tagged files, with only the gh transport replaced: never publishes or changes an existing release.
async function rehearsal() {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-notes-rc-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  await mkdir(join(dir, ".github/scripts"), { recursive: true });
  await writeFile(join(dir, ".github/scripts/release-notes.mjs"), await readFile(scriptPath));
  await writeFile(join(dir, "CHANGELOG.md"), changelog);
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "fixture");
  git("tag", "v1.2.3");
  git("tag", "v1.2.3-rc.1");
  await writeFile(join(dir, "CHANGELOG.md"), "This default branch content must not be used.");
  await mkdir(join(dir, "bin"));
  await writeFile(
    join(dir, "bin/gh"),
    `#!/usr/bin/env bash
set -eu
if [ "$2" = "view" ]; then
  if [ "\${VIEW_FAIL:-false}" = true ]; then exit 1; fi
  printf '%s' "$EXISTING_BODY"
elif [ "$2" = "edit" ]; then
  [ "$4" = "--notes-file" ]
  cp "$5" "$CAPTURE"
else exit 2; fi
`,
    { mode: 0o755 },
  );
  return {
    dir,
    run: (extra: Record<string, string> = {}) =>
      spawnSync("bash", [writerPath], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(dir, "bin")}:${process.env.PATH}`,
          TAG: "v1.2.3",
          DRY_RUN: "false",
          FORCE: "false",
          CAPTURE: join(dir, "body.md"),
          EXISTING_BODY: "Standalone binaries for v1.2.3. Release notes follow.",
          ...extra,
        },
      }),
  };
}

test("writer reads the tagged changelog, replaces placeholders, preserves manual notes unless forced", {
  skip: process.platform === "win32",
}, async () => {
  const { dir, run } = await rehearsal();
  try {
    assert.equal(run().status, 0);
    assert.equal(await readFile(join(dir, "body.md"), "utf8"), script.releaseBody("v1.2.3", changelog));
    await rm(join(dir, "body.md"));
    const preserved = run({ EXISTING_BODY: "Hand-written note." });
    assert.equal(preserved.status, 0);
    assert.match(preserved.stdout, /Preserving/);
    await assert.rejects(readFile(join(dir, "body.md")), /ENOENT/);
    assert.equal(run({ EXISTING_BODY: "Hand-written note.", FORCE: "true" }).status, 0);
    assert.equal(await readFile(join(dir, "body.md"), "utf8"), script.releaseBody("v1.2.3", changelog));
    assert.equal(run({ VIEW_FAIL: "true" }).status, 1, "an API failure must not overwrite notes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rc-tag dry run reports the complete body and makes no GitHub calls", {
  skip: process.platform === "win32",
}, async () => {
  const { dir, run } = await rehearsal();
  try {
    const rc = run({
      TAG: "v1.2.3-rc.1",
      DRY_RUN: "true",
      VIEW_FAIL: "true",
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
    });
    assert.equal(rc.status, 0, rc.stderr);
    assert.equal(rc.stdout, script.releaseBody("v1.2.3-rc.1", changelog));
    assert.equal(await readFile(join(dir, "summary"), "utf8"), rc.stdout);
    await assert.rejects(readFile(join(dir, "body.md")), /ENOENT/);
    assert.equal(run({ TAG: "v9.9.9", FORCE: "true" }).status, 128, "missing tags fail before any edit");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("notes run after binaries and manual edits default to preview with force off", async () => {
  const release = parse(await readFile(".github/workflows/release.yml", "utf8")) as {
    jobs: Record<string, { needs: string[]; uses: string; with: Record<string, string> }>;
  };
  assert.deepEqual(release.jobs["release-notes"]?.needs, ["publish-binaries"]);
  assert.equal(release.jobs["release-notes"]?.uses, "./.github/workflows/release-notes.yml");
  const notes = parse(await readFile(".github/workflows/release-notes.yml", "utf8")) as {
    on: { workflow_dispatch: { inputs: Record<string, { default?: boolean }> } };
  };
  assert.equal(notes.on.workflow_dispatch.inputs.dry_run?.default, true);
  assert.equal(notes.on.workflow_dispatch.inputs.force?.default, false);
});
