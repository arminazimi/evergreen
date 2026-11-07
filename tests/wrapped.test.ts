import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { DiffError, diffRefs, exportRef, stderrMessage } from "../src/diff.js";
import type { Finding } from "../src/domain.js";
import {
  animateWrappedCards,
  buildWrapped,
  buildWrappedCards,
  defaultAsOf,
  longestEndedFinding,
  nextDeadlineInComingYear,
  parseWrappedYear,
  playWrapped,
  renderWrappedSvg,
  renderWrappedText,
  resolveWrappedRefs,
  topOwnersByFixed,
  WrappedError,
  type WrappedResult,
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
async function yearRepository(options: { codeowners?: boolean | string } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-wrapped-"));
  roots.push(root);
  git(root, {}, "init", "-q", "-b", "main");
  await commitAt(root, "2023-06-01T12:00:00+0000", "start on 18", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "18" } }),
    "src/app.js": "module.exports = 1;\n",
  });
  if (options.codeowners !== false) {
    const text = typeof options.codeowners === "string" ? options.codeowners : "* @platform\nsrc/ @app-team\n";
    await commitAt(root, "2023-07-01T12:00:00+0000", "owners", { CODEOWNERS: text });
  }
  await commitAt(root, "2024-03-15T12:00:00+0000", "fix to 24", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "24" } }),
  });
  await commitAt(root, "2024-08-20T12:00:00+0000", "regress to 16", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "16" } }),
  });
  return root;
}

let findingSeq = 0;
const finding = (overrides: Partial<Finding> = {}): Finding =>
  ({
    id: `id-${++findingSeq}`,
    ruleId: "demo.rule",
    detector: "nodejs",
    title: "Demo finding",
    summary: "A demo finding.",
    severity: "medium",
    confidence: "high",
    location: { path: "package.json", line: 1 },
    sources: [],
    ...overrides,
  }) as Finding;

const baseResult = (overrides: Partial<WrappedResult> = {}): WrappedResult => ({
  schemaVersion: "evergreen.wrapped.v1",
  year: 2024,
  base: "aaa",
  head: "bbb",
  usedFirstCommitFallback: false,
  fixed: 2,
  introduced: 1,
  net: 1,
  ...overrides,
});

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

test("stderrMessage reads Buffer, string, empty, and missing stderr", () => {
  assert.equal(stderrMessage({ stderr: Buffer.from(" boom \n") }), "boom");
  assert.equal(stderrMessage({ stderr: "  fail  " }), "fail");
  assert.equal(stderrMessage({ stderr: Buffer.from("   ") }), undefined);
  assert.equal(stderrMessage({ stderr: "   " }), undefined);
  assert.equal(stderrMessage({ stderr: 12 }), undefined);
  assert.equal(stderrMessage("plain"), undefined);
  assert.equal(stderrMessage(null), undefined);
  assert.equal(stderrMessage({}), undefined);
});

test("exportRef refuses a dash-prefixed ref and reports tar failures", async () => {
  const root = await yearRepository();
  const directory = await mkdtemp(join(tmpdir(), "evergreen-export-"));
  roots.push(directory);
  assert.throws(() => exportRef(root, "--all", directory), /not a valid ref/);
  assert.throws(() => exportRef(root, "HEAD", join(directory, "missing", "nested")), /Cannot unpack/);
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

test("a past year's head is the last commit of that year, not HEAD", async () => {
  const root = await yearRepository();
  await commitAt(root, "2025-04-01T12:00:00+0000", "later year", {
    "package.json": JSON.stringify({ name: "demo", engines: { node: "24" } }),
  });
  const headNow = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const refs = resolveWrappedRefs(root, 2024);
  assert.notEqual(refs.head, headNow);
  const headDate = execFileSync("git", ["show", "-s", "--format=%cI", refs.head], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.ok(headDate.startsWith("2024-"));
});

test("the current year uses HEAD as the head ref", async () => {
  const root = await yearRepository();
  const currentYear = Number(new Date().toISOString().slice(0, 4));
  const headNow = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(resolveWrappedRefs(root, currentYear).head, headNow);
});

test("a year before any commit fails with no commits on or before", async () => {
  const root = await yearRepository();
  assert.throws(() => resolveWrappedRefs(root, 1990), /No commits on or before 1990/);
});

test("outside a git repository fails as DiffError", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-wrapped-nogit-"));
  roots.push(root);
  assert.throws(() => resolveWrappedRefs(root, 2024), DiffError);
  const { code, stderr } = await runCli(["wrapped", root, "--year", "2024", "--json"]);
  assert.equal(code, 2);
  assert.match(stderr, /not a git repository|git /i);
});

test("an empty repository fails with no commits", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-wrapped-empty-"));
  roots.push(root);
  git(root, {}, "init", "-q", "-b", "main");
  assert.throws(() => resolveWrappedRefs(root, 2024), /(no commits|ambiguous argument|unknown revision|Failed)/i);
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

test("topOwners empty list and name-tie break", () => {
  const empty = topOwnersByFixed([finding({ location: { path: "package.json" } })], "docs/ @docs\n");
  assert.deepEqual(empty, []);
  assert.match(buildWrappedCards(baseResult({ topOwners: [] })).join("\n"), /\(no owned fixed findings\)/);

  const tied = topOwnersByFixed(
    [
      finding({ location: { path: "a.js" } }),
      finding({ location: { path: "b.js" } }),
      finding({ location: { path: "c.js" } }),
      finding({ location: { path: "d.js" } }),
    ],
    "a.js @zeta\nb.js @alpha\nc.js @zeta\nd.js @alpha\n",
  );
  assert.deepEqual(tied, [
    { owner: "@alpha", fixed: 2 },
    { owner: "@zeta", fixed: 2 },
  ]);
});

test("longestEnded prefers the furthest past, ties by earlier deadline, skips equal and invalid", () => {
  const asOf = "2024-12-31";
  assert.equal(longestEndedFinding([finding({ deadline: asOf })], asOf), undefined);
  assert.equal(longestEndedFinding([finding({ deadline: "not-a-date" })], asOf), undefined);
  assert.equal(longestEndedFinding([finding({})], asOf), undefined);

  const winner = longestEndedFinding(
    [
      finding({ title: "newer", ruleId: "a", deadline: "2024-01-01" }),
      finding({ title: "older", ruleId: "b", deadline: "2020-01-01" }),
    ],
    asOf,
  );
  assert.equal(winner?.ruleId, "b");
  assert.equal(
    winner?.daysPast,
    Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse("2020-01-01T00:00:00Z")) / 86_400_000),
  );

  const byDeadline = longestEndedFinding(
    [
      finding({ title: "later", ruleId: "z", deadline: "2022-06-01" }),
      finding({ title: "earlier", ruleId: "a", deadline: "2022-05-01" }),
    ],
    asOf,
  );
  assert.equal(byDeadline?.deadline, "2022-05-01");

  const byRule = longestEndedFinding(
    [
      finding({ title: "second", ruleId: "b", deadline: "2023-01-01" }),
      finding({ title: "first", ruleId: "a", deadline: "2023-01-01" }),
    ],
    asOf,
  );
  assert.equal(byRule?.ruleId, "a");
});

test("nextDeadlineInComingYear picks the earliest in year+1", () => {
  assert.equal(nextDeadlineInComingYear([finding({ deadline: "2024-06-01" })], 2024), undefined);
  assert.equal(nextDeadlineInComingYear([finding({ deadline: "2026-01-01" })], 2024), undefined);
  assert.equal(nextDeadlineInComingYear([finding({})], 2024), undefined);
  const next = nextDeadlineInComingYear(
    [
      finding({ title: "late", ruleId: "b", deadline: "2025-12-01" }),
      finding({ title: "early", ruleId: "a", deadline: "2025-02-01" }),
    ],
    2024,
  );
  assert.deepEqual(next, { title: "early", ruleId: "a", deadline: "2025-02-01" });
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

test("cards omit optional sections and render negative net and singular day", () => {
  const minimal = buildWrappedCards(baseResult({ net: -3, fixed: 0, introduced: 3 }));
  assert.equal(minimal.length, 3);
  assert.match(minimal[2]!, /^-3$/m);

  const withDay = buildWrappedCards(
    baseResult({
      longestEnded: { title: "One", ruleId: "r", deadline: "2024-12-30", daysPast: 1 },
      nextDeadline: { title: "Next", ruleId: "n", deadline: "2025-01-15" },
    }),
  );
  assert.match(withDay.join("\n"), /1 day past/);
  assert.doesNotMatch(withDay.join("\n"), /CODEOWNERS/);
});

test("SVG rows, escaping, and three vs six metrics", () => {
  const three = renderWrappedSvg(baseResult({ net: -1 }));
  assert.match(three, /Fixed/);
  assert.match(three, /Introduced/);
  assert.match(three, /Net/);
  assert.doesNotMatch(three, /Longest ended/);
  assert.match(three, /this repository/);

  const escaped = renderWrappedSvg(baseResult(), 'repo & "x" <y>');
  assert.match(escaped, /repo &amp; &quot;x&quot; &lt;y&gt;/);

  const six = renderWrappedSvg(
    baseResult({
      longestEnded: { title: "Old <thing>", ruleId: "r", deadline: "2020-01-01", daysPast: 10 },
      topOwners: [{ owner: "@a", fixed: 1 }],
      nextDeadline: { title: "Soon", ruleId: "n", deadline: "2025-06-01" },
    }),
    "acme/demo",
  );
  assert.match(six, /Longest ended/);
  assert.match(six, /Top owners/);
  assert.match(six, /Next deadline/);
  assert.match(six, /Old &lt;thing&gt;/);
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

test("CLI usage failures and WrappedError year", async () => {
  const root = await yearRepository();
  const cases: string[][] = [
    ["wrapped", root, "--year"],
    ["wrapped", root, "--year", "--json"],
    ["wrapped", root, "--svg"],
    ["wrapped", root, "a", "b"],
    ["wrapped", root, "--nope"],
    ["wrapped", root, "--json", "--svg", join(root, "x.svg")],
  ];
  for (const argv of cases) {
    const result = await runCli(argv);
    assert.equal(result.code, 2, argv.join(" "));
  }
  const badYear = await runCli(["wrapped", root, "--year", "abc", "--json"]);
  assert.equal(badYear.code, 2);
  assert.match(badYear.stderr, /not a year/);
});

test("playWrapped respects no TTY, noAnimation, fallback notice, and the six-second budget", async () => {
  const result = baseResult({ usedFirstCommitFallback: true });
  const writes: string[] = [];
  let slept = 0;
  const io = {
    isTTY: true,
    write: (text: string) => {
      writes.push(text);
    },
    sleep: async (ms: number) => {
      slept += ms;
    },
  };

  await playWrapped(result, { io: { ...io, isTTY: false } });
  assert.match(writes.join(""), /No commit before 2024/);
  writes.length = 0;

  await playWrapped(result, { io, noAnimation: true });
  assert.match(writes.join(""), /Findings fixed/);
  writes.length = 0;

  await playWrapped(result, { io });
  assert.ok(writes.some((text) => text.includes("No commit before 2024")));
  assert.ok(slept <= 6000);

  writes.length = 0;
  slept = 0;
  await animateWrappedCards(["only"], io, "notice");
  assert.deepEqual(writes, ["notice\n\n", "only\n"]);
  assert.equal(slept, 0);
});

test("CLI interactive path calls playWrapped when stdout is a TTY", async () => {
  const root = await yearRepository();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  try {
    const result = await runCli(["wrapped", root, "--year", "2024"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Findings fixed in 2024|Net change/);
  } finally {
    if (descriptor === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
    else Object.defineProperty(process.stdout, "isTTY", descriptor);
  }
});

test("CLI defaults the path to cwd and buildWrapped defaults the year", async () => {
  const root = await yearRepository();
  const currentYear = Number(new Date().toISOString().slice(0, 4));
  const withoutYear = await buildWrapped(root, builtInDetectors, { asOf: `${currentYear}-12-31` });
  assert.equal(withoutYear.year, currentYear);

  const { code, stdout } = await runCli(["wrapped", "--year", "2024", "--json"], { cwd: root });
  assert.equal(code, 0);
  assert.equal((JSON.parse(stdout) as { year: number }).year, 2024);
});

test("CLI --svg that cannot be written surfaces as a non-DiffError failure", async () => {
  const root = await yearRepository();
  const { code, stderr } = await runCli([
    "wrapped",
    root,
    "--year",
    "2024",
    "--svg",
    join(root, "no", "such", "dir", "x.svg"),
  ]);
  assert.ok(code !== 0);
  assert.match(stderr, /ENOENT|no such file|not found|failed/i);
});

test("--svg with a flag-like value is a usage error", async () => {
  const root = await yearRepository();
  const { code } = await runCli(["wrapped", root, "--svg", "--json"]);
  assert.equal(code, 2);
});
