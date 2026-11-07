import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { diffRefs } from "../src/diff.js";
import {
  buildWrapped,
  buildWrappedCards,
  defaultAsOf,
  parseWrappedYear,
  playWrapped,
  renderWrappedSvg,
  renderWrappedText,
  resolveWrappedRefs,
  WrappedError,
} from "../src/wrapped.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
}

async function commitAt(root: string, date: string, message: string, files: Record<string, string>): Promise<void> {
  for (const [relative, contents] of Object.entries(files)) {
    const path = join(root, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, contents);
  }
  git(root, {}, "add", ".");
  git(root, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, "commit", "-q", "-m", message, "--allow-empty");
}

/** A repo that starts on Node 18 in 2023, then in 2024 fixes it and later reintroduces Node 16. */
async function yearRepository(options: { codeowners?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-wrapped-"));
  roots.push(root);
  git(root, {}, "init", "-q", "-b", "main");
  await commitAt(root, "2023-06-01T12:00:00+0000", "start on 18", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "18" } }),
    "src/app.js": "module.exports = 1;\n",
  });
  if (options.codeowners !== false) {
    await commitAt(root, "2023-07-01T12:00:00+0000", "owners", {
      CODEOWNERS: "* @platform\nsrc/ @app-team\n",
    });
  }
  await commitAt(root, "2024-03-15T12:00:00+0000", "fix to 24", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "24" } }),
  });
  await commitAt(root, "2024-08-20T12:00:00+0000", "regress to 16", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "16" } }),
  });
  return root;
}

test("parseWrappedYear accepts a four-digit year and rejects junk", () => {
  assert.equal(parseWrappedYear(undefined, 2026), 2026);
  assert.equal(parseWrappedYear("2024", 2026), 2024);
  assert.throws(() => parseWrappedYear("24", 2026), WrappedError);
  assert.throws(() => parseWrappedYear("abcd", 2026), WrappedError);
});

test("defaultAsOf uses Dec 31 for a past year and today for the current year", () => {
  assert.equal(defaultAsOf(2024, "2026-11-07"), "2024-12-31");
  assert.equal(defaultAsOf(2026, "2026-11-07"), "2026-11-07");
});

test("counts match evergreen diff for the same refs", async () => {
  const root = await yearRepository();
  const wrapped = await buildWrapped(root, builtInDetectors, { year: 2024, asOf: "2024-12-31" });
  const diff = await diffRefs(root, `${wrapped.base}..${wrapped.head}`, builtInDetectors);
  assert.equal(wrapped.fixed, diff.fixed.length);
  assert.equal(wrapped.introduced, diff.introduced.length);
  assert.equal(wrapped.net, wrapped.fixed - wrapped.introduced);
  assert.equal(wrapped.schemaVersion, "evergreen.wrapped.v1");
  assert.equal(wrapped.usedFirstCommitFallback, false);
  assert.ok(wrapped.fixed >= 1, "fixing node 18 clears at least one finding");
  assert.ok(wrapped.introduced >= 1, "node 16 introduces at least one finding");
});

test("top owners come from CODEOWNERS and are omitted when none exists", async () => {
  const withOwners = await buildWrapped(await yearRepository({ codeowners: true }), builtInDetectors, {
    year: 2024,
    asOf: "2024-12-31",
  });
  assert.ok(withOwners.topOwners !== undefined);
  assert.ok(withOwners.topOwners!.length >= 1);
  assert.equal(withOwners.topOwners![0]!.owner, "@platform");

  const without = await buildWrapped(await yearRepository({ codeowners: false }), builtInDetectors, {
    year: 2024,
    asOf: "2024-12-31",
  });
  assert.equal(without.topOwners, undefined);
  assert.ok(!("topOwners" in JSON.parse(JSON.stringify(without))));
});

test("first-commit fallback when nothing predates the year", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-wrapped-first-"));
  roots.push(root);
  git(root, {}, "init", "-q", "-b", "main");
  await commitAt(root, "2025-02-01T12:00:00+0000", "born in 2025", {
    "package.json": JSON.stringify({ name: "new", engines: { node: "18" } }),
  });
  await commitAt(root, "2025-06-01T12:00:00+0000", "still 18", {
    "README.md": "hi\n",
  });
  const refs = resolveWrappedRefs(root, 2025);
  assert.equal(refs.usedFirstCommitFallback, true);
  assert.notEqual(refs.base, "");
  assert.notEqual(refs.head, "");
  const wrapped = await buildWrapped(root, builtInDetectors, { year: 2025, asOf: "2025-12-31" });
  assert.equal(wrapped.usedFirstCommitFallback, true);
  assert.equal(wrapped.base, refs.base);
  assert.match(renderWrappedText(wrapped), /No commit before 2025/);
});

test("the working tree is never modified", async () => {
  const root = await yearRepository();
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "demo", engines: { node: "14" } }));
  const before = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  const { code } = await runCli(["wrapped", root, "--year", "2024", "--json"]);
  assert.equal(code, 0);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), before);
  assert.match(before, /M package\.json/);
});

test("JSON shape and SVG card", async () => {
  const root = await yearRepository();
  const wrapped = await buildWrapped(root, builtInDetectors, { year: 2024, asOf: "2024-12-31" });
  const parsed = JSON.parse(JSON.stringify(wrapped)) as Record<string, unknown>;
  assert.equal(parsed.schemaVersion, "evergreen.wrapped.v1");
  assert.equal(parsed.year, 2024);
  for (const key of ["fixed", "introduced", "net", "base", "head"]) assert.ok(key in parsed);
  const svg = renderWrappedSvg(wrapped, "acme/demo");
  assert.match(svg, /width="1200"/);
  assert.match(svg, /height="630"/);
  assert.match(svg, /2024 wrapped/);
  assert.doesNotMatch(svg, /<script/);
  assert.ok(buildWrappedCards(wrapped).length >= 3);
});

test("CLI --json, --svg, and static text", async () => {
  const root = await yearRepository();
  const jsonRun = await runCli(["wrapped", root, "--year", "2024", "--json"]);
  assert.equal(jsonRun.code, 0);
  const body = JSON.parse(jsonRun.stdout) as { fixed: number; introduced: number; year: number };
  assert.equal(body.year, 2024);
  assert.equal(typeof body.fixed, "number");

  const svgPath = join(root, "wrapped.svg");
  const svgRun = await runCli(["wrapped", root, "--year", "2024", "--svg", svgPath]);
  assert.equal(svgRun.code, 0);
  assert.match(await readFile(svgPath, "utf8"), /width="1200"/);

  const textRun = await runCli(["wrapped", root, "--year", "2024", "--no-animation"], {
    env: { NO_COLOR: "1" },
  });
  assert.equal(textRun.code, 0);
  assert.match(textRun.stdout, /Findings fixed in 2024/);
});

test("playWrapped respects the six-second budget with injectable io", async () => {
  const root = await yearRepository();
  const result = await buildWrapped(root, builtInDetectors, { year: 2024, asOf: "2024-12-31" });
  let slept = 0;
  const writes: string[] = [];
  await playWrapped(result, {
    io: {
      isTTY: true,
      write: (text) => {
        writes.push(text);
      },
      sleep: async (ms) => {
        slept += ms;
      },
    },
  });
  assert.ok(slept <= 6000);
  assert.ok(writes.length >= 3);
});
