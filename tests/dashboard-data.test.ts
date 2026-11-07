import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { loadPublicCorpus } from "../benchmarks/public-corpus.js";
import { TARGETS_PATH } from "../benchmarks/corpus-targets.js";
import type { CorpusTargets } from "../benchmarks/corpus-targets.js";
import { countEvidence, earnedLevel } from "../benchmarks/thresholds.js";
import type { Thresholds } from "../benchmarks/thresholds.js";
import {
  ageInDays,
  buildDashboardData,
  detectorCounts,
  detectorEcosystems,
  isWellFormedDashboardData,
  renderDashboardData,
  OUTPUT_FILE,
} from "../tools/build-dashboard-data.js";

const execute = promisify(execFile);
const script = resolve("dist/tools/build-dashboard-data.js");
const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
const targets = JSON.parse(await readFile(resolve(TARGETS_PATH), "utf8")) as CorpusTargets;
const corpus = (await loadPublicCorpus()).repositories;
const runDate = thresholds.lastFullRun!.date;
const build = (today = runDate) => buildDashboardData({ thresholds, corpus, targets, today });

test("every detector in thresholds.json has a row, with the configured level next to the earned level", () => {
  const data = build();
  assert.deepEqual(
    data.detectors.map((detector) => detector.id),
    Object.keys(thresholds.detectors).sort(),
  );
  for (const detector of data.detectors) {
    const configured = thresholds.detectors[detector.id]!;
    assert.equal(detector.level, configured.level);
    assert.deepEqual(detector.precisionFloor, { value: configured.minPrecision, enforced: configured.stable });
    const evidence = countEvidence(corpus, detector.id, detectorEcosystems[detector.id]!);
    assert.deepEqual(detector.evidence, evidence);
    assert.equal(detector.earnedLevel, earnedLevel(evidence));
  }
  // After #1894 every detector's configured level matches the evidence it earns. Gaps remain
  // allowed in principle (grandfathered Supported, or an under-promoted beta); none are open today.
  assert.deepEqual(
    data.detectors.filter((detector) => detector.level !== detector.earnedLevel).map((detector) => detector.id),
    [],
  );
});

test("counts, precision, and recall are the lastFullRun numbers on the real file", () => {
  const data = build();
  const last = thresholds.lastFullRun!;
  assert.deepEqual(data.run, {
    date: last.date,
    commit: last.commit,
    repositories: last.repositories,
    findings: last.findings,
    runAgeDays: 0,
    recordedPrecision: last.precision,
    recordedRecall: last.recall,
    timing: { medianScanMs: null, p95ScanMs: null, note: "not measured" },
  });
  for (const detector of data.detectors) {
    const counts = last.perDetector[detector.id];
    assert.deepEqual(detector.run, counts ? detectorCounts(counts) : null);
  }
  assert.deepEqual(
    data.detectors.find((detector) => detector.id === "ruby")!.run,
    detectorCounts(last.perDetector.ruby!),
  );
  const total = data.detectors.reduce(
    (sum, detector) => sum + (detector.run?.truePositives ?? 0) + (detector.run?.falsePositives ?? 0),
    0,
  );
  assert.equal(total, last.findings);
  assert.equal(data.corpus.repositories, corpus.length);
  assert.ok(data.corpus.repositories >= last.repositories);
});

test("the evidence counts agree with the reviewed corpus", () => {
  const evidence = Object.fromEntries(build().detectors.map((detector) => [detector.id, detector.evidence]));
  const counts = ({
    repositoriesWithFindings,
    expectedFindings,
    zeroFindingRepositories,
  }: {
    repositoriesWithFindings: number;
    expectedFindings: number;
    zeroFindingRepositories: number;
  }) => ({ repositoriesWithFindings, expectedFindings, zeroFindingRepositories });
  // ADR 0013's table is the 90-repository snapshot; the two .NET repositories with workflow findings added 2 and 6 to GitHub Actions in its 2026-10-19 update. The PHP corpus added 2 repositories-with-findings and 14 findings, and the Android corpus added 1 repository-with-findings and 8 findings. The C/C++ corpus added 2 repositories-with-findings and 7 findings. The Next.js lifecycle rules added 2 repositories-with-findings (trpc/trpc and TanStack/query) and 12 npm findings. The TanStack/query Angular declarations added 12 npm findings for the v20 Angular rule to a repository already counted. The Swift blind corpus added 3 repositories and 11 findings. The Next.js 13 and 14 support-end findings in excalidraw/excalidraw and umami-software/umami added 2 npm findings to repositories already counted. The CI runner images corpus pinned five public repositories: four with findings (8 ci-images findings in total) and one zero-finding repository. The Dart corpus pinned five public repositories: four with findings (8 dart findings in total) and one zero-finding repository; three of the four also have GitHub Actions findings (12 in total) and one has a Swift finding. The Terraform corpus pinned five public repositories: four with findings (6 terraform findings in total) and one zero-finding repository; one of the four also has GitHub Actions findings (4 in total). The Database runtimes corpus pinned five public repositories: four with findings and one zero-finding repository; the database detector also reports on the postgres images in umami-software/umami and trpc/trpc (2 findings, counted with the four for 8 database findings in total), three of the four new repositories also have GitHub Actions findings (11 in total), and CodeForPoznan/infrastructure adds 1 terraform finding to the Terraform counts. The `dotnet-version` inputs of actions/setup-dotnet added 5 .NET findings to repositories already counted (3 in xunit/xunit.analyzers, 1 each in Chrome-Developer-Mode-Extension-Warning-Patcher and SharpSocks). The two .NET base images in nettitude/SharpSocks added 2 .NET findings to a repository already counted. The scheduled Node.js 22 rule added 42 nodejs findings: 7 repositories with no other npm finding gained one, so the npm zero-finding count fell by 2 (two of them already had an npm-rule finding counted elsewhere). The EKS 1.24 pin in infracost/example-terraform added 1 terraform finding and 1 repository-with-findings, and the MYSQL_5_7 pin in BaptisteLecat/gcp_architect_certification added 1 database finding and 1 repository-with-findings. The Terraform interpolation-only rule added 8 findings in GoogleCloudPlatform/notebooks-blueprint-security, which had no terraform finding before, so the terraform repositories-with-findings rose by 1 and the zero-finding count fell by 1. The remaining 28 interpolation-only findings (two more repositories with findings, one fewer zero-finding repository) and the 8 node-sass findings (npm) were recorded once the corpus job ran on pull requests, along with the redis 7.0 and postgres 10 images in HomeBusProjects/HomeBus and weareasterisk/gavel2 (database).
  // The Go and Rust stable corpus added 97 repositories. Their workflows add 227 GitHub Actions findings in 36 repositories already counted, vault adds 22 Terraform findings (one repository), rustodon adds a database finding (one repository), and mesalink adds a C/C++ finding (one repository).
  // Workflow-command rules add three set-output findings in actions/toolkit and dai-shi/reactive-react-redux, and 10 more set-output and set-env findings in six repositories already counted.
  // The Ruby and PHP stable corpus added 48 and 96 repositories; the new repositories carry the other detectors' findings too (GitHub Actions, npm, C/C++, database, Terraform), recorded from a full offline scan.
  // The pinned Go, Java, and Rust workflows add 36 command findings in seven repositories (#2447).
  // The Java and Scala stable corpus (#1896), Swift/.NET (#1900), and C/C++/Shell (#1897)
  // promotions together raise cross-detector evidence counted here.
  // The Elixir stable corpus and the two Deno/Bun pins add 139 GitHub Actions findings in 24 new
  // repositories, 4 .NET findings in one repository, 3 Ruby findings in one repository, and 1 C/C++
  // finding in one repository.
  // The Dart and Android stable corpus (#1894) added 63 and 72 repositories; their workflows and nested packages add GitHub Actions, C/C++, Ruby, and shell findings recorded from a full offline scan.
  assert.deepEqual(counts(evidence["github-actions"]!), {
    repositoriesWithFindings: 467,
    expectedFindings: 3293,
    zeroFindingRepositories: 4,
  });
  assert.deepEqual(counts(evidence["npm"]!), {
    repositoriesWithFindings: 66,
    expectedFindings: 143,
    zeroFindingRepositories: 18,
  });
  assert.deepEqual(counts(evidence["dotnet"]!), {
    repositoriesWithFindings: 65,
    expectedFindings: 590,
    zeroFindingRepositories: 9,
  });
  assert.deepEqual(counts(evidence["php"]!), {
    repositoriesWithFindings: 35,
    expectedFindings: 72,
    zeroFindingRepositories: 53,
  });
  assert.deepEqual(counts(evidence["ruby"]!), {
    repositoriesWithFindings: 61,
    expectedFindings: 276,
    zeroFindingRepositories: 23,
  });
  assert.deepEqual(counts(evidence["swift"]!), {
    repositoriesWithFindings: 58,
    expectedFindings: 75,
    zeroFindingRepositories: 15,
  });
  assert.deepEqual(counts(evidence["cpp"]!), {
    repositoriesWithFindings: 30,
    expectedFindings: 276,
    zeroFindingRepositories: 4,
  });
  assert.deepEqual(counts(evidence["ci-images"]!), {
    repositoriesWithFindings: 29,
    expectedFindings: 63,
    zeroFindingRepositories: 20,
  });
  assert.deepEqual(counts(evidence["dart"]!), {
    repositoriesWithFindings: 31,
    expectedFindings: 138,
    zeroFindingRepositories: 18,
  });
  assert.deepEqual(counts(evidence["android"]!), {
    repositoriesWithFindings: 42,
    expectedFindings: 87,
    zeroFindingRepositories: 22,
  });
  assert.deepEqual(counts(evidence["terraform"]!), {
    repositoriesWithFindings: 15,
    expectedFindings: 482,
    zeroFindingRepositories: 1,
  });
  assert.deepEqual(counts(evidence["database"]!), {
    repositoriesWithFindings: 21,
    expectedFindings: 26,
    zeroFindingRepositories: 1,
  });
  assert.deepEqual(counts(evidence["shell"]!), {
    repositoriesWithFindings: 30,
    expectedFindings: 104,
    zeroFindingRepositories: 9,
  });
  assert.deepEqual(counts(evidence["java"]!), {
    repositoriesWithFindings: 21,
    expectedFindings: 71,
    zeroFindingRepositories: 4,
  });
  assert.deepEqual(counts(evidence["scala"]!), {
    repositoriesWithFindings: 51,
    expectedFindings: 77,
    zeroFindingRepositories: 12,
  });
  assert.deepEqual(counts(evidence["elixir"]!), {
    repositoriesWithFindings: 32,
    expectedFindings: 73,
    zeroFindingRepositories: 4,
  });
  assert.deepEqual(counts(evidence["deno"]!), {
    repositoriesWithFindings: 2,
    expectedFindings: 2,
    zeroFindingRepositories: 0,
  });
});

test("the corpus section counts every bucket and carries its committed minimum and target", () => {
  const data = build();
  assert.equal(data.corpus.ecosystems.length, Object.keys(targets.minimum).length);
  assert.equal(
    data.corpus.ecosystems.reduce((sum, ecosystem) => sum + ecosystem.repositories, 0),
    corpus.length,
  );
  for (const ecosystem of data.corpus.ecosystems) {
    assert.equal(ecosystem.repositories, corpus.filter((entry) => entry.ecosystem === ecosystem.id).length);
    assert.equal(ecosystem.minimum, targets.minimum[ecosystem.id]);
    assert.equal(ecosystem.target, targets.target);
    assert.ok(ecosystem.repositories >= ecosystem.minimum, `${ecosystem.id} is below its minimum`);
  }
});

test("a detector with no run data has null run numbers, not zeros", () => {
  const { perDetector, ...rest } = thresholds.lastFullRun!;
  const { rust: _removed, ...others } = perDetector;
  const data = buildDashboardData({
    thresholds: { ...thresholds, lastFullRun: { ...rest, perDetector: others } },
    corpus,
    targets,
    today: runDate,
  });
  assert.equal(data.detectors.find((detector) => detector.id === "rust")!.run, null);
  assert.notEqual(data.detectors.find((detector) => detector.id === "go")!.run, null);
});

test("with no recorded run there is no run block and every detector has no run numbers", () => {
  const { lastFullRun: _dropped, ...withoutRun } = thresholds;
  const data = buildDashboardData({ thresholds: withoutRun, corpus, targets, today: runDate });
  assert.equal(data.run, null);
  assert.ok(data.detectors.every((detector) => detector.run === null));
  assert.throws(() => buildDashboardData({ thresholds: withoutRun, corpus, targets, today: "nope" }), /--today/);
});

test("a zero denominator gives null, never 0, 1, or NaN", () => {
  assert.deepEqual(detectorCounts({ truePositives: 0, falsePositives: 0, falseNegatives: 0 }), {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: null,
    recall: null,
  });
  const onlyMisses = detectorCounts({ truePositives: 0, falsePositives: 0, falseNegatives: 4 });
  assert.equal(onlyMisses.precision, null);
  assert.equal(onlyMisses.recall, 0);
  const onlyExtras = detectorCounts({ truePositives: 0, falsePositives: 3, falseNegatives: 0 });
  assert.equal(onlyExtras.precision, 0);
  assert.equal(onlyExtras.recall, null);
  const mixed = detectorCounts({ truePositives: 9, falsePositives: 1, falseNegatives: 3 });
  assert.equal(mixed.precision, 0.9);
  assert.equal(mixed.recall, 0.75);
  assert.equal(detectorCounts({ truePositives: 1, falsePositives: 0, falseNegatives: 2 }).recall, 0.3333);
});

test("runAgeDays comes from --today, and invalid days are refused", () => {
  assert.equal(ageInDays("2026-10-18", "2026-10-18"), 0);
  assert.equal(ageInDays("2026-10-18", "2026-11-01"), 14);
  assert.equal(ageInDays("2026-02-27", "2026-03-01"), 2);
  assert.equal(ageInDays("2027-12-25", "2028-03-01"), 67);
  // Derived from the recorded run, so recording a newer run does not break this test.
  const later = new Date(Date.parse(`${runDate}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(build(later).run!.runAgeDays, 27);
  assert.equal(build(later).referenceDay, later);
  assert.throws(() => ageInDays("2026-10-18", "2026-10-17"), /before the last full run/);
  for (const bad of ["2026-13-01", "2026-02-30", "18-10-2026", "2026-10-18T00:00:00Z", "", "today"]) {
    assert.throws(() => ageInDays("2026-10-18", bad), /YYYY-MM-DD/, bad);
  }
});

test("the same inputs give the same bytes, whatever the clock", async () => {
  const first = await renderDashboardData(".", runDate);
  const originalNow = Date.now;
  Date.now = () => 0;
  try {
    assert.equal(await renderDashboardData(".", runDate), first);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(await renderDashboardData(".", "run-date"), first);
  assert.notEqual(await renderDashboardData(".", "2027-01-01"), first);
  assert.ok(first.endsWith("}\n") && !first.includes("\r"));
});

test("the definitions cover every metric, name a committed source, and the limitations are stated plainly", async () => {
  const data = build();
  const keys = [
    "level",
    "earnedLevel",
    "precisionFloor",
    "precision",
    "recall",
    "truePositives",
    "falsePositives",
    "falseNegatives",
    "repositoriesWithFindings",
    "expectedFindings",
    "zeroFindingRepositories",
    "runAge",
    "scanTime",
    "freshnessTarget",
    "freshnessAge",
    "corpusRepositories",
    "corpusMinimum",
    "corpusTarget",
  ];
  assert.deepEqual(Object.keys(data.definitions), keys);
  for (const [key, definition] of Object.entries(data.definitions)) {
    assert.ok(definition.label && definition.meaning && definition.computation, key);
    const source = await stat(resolve(definition.source));
    assert.ok(source.isFile() || source.isDirectory(), `${key} source ${definition.source}`);
  }
  assert.equal(
    data.limitations[0],
    "A precision of 1.0 means no regression against this corpus. The expected findings were written by reviewing the same commits, so it does not show that the detectors generalize to unseen repositories. See ADR 0013 and issue #740.",
  );
  assert.ok(data.limitations.some((line) => line.includes("Scan time is not measured")));
  assert.doesNotMatch(JSON.stringify(data), /medianScanMs":\s*\d/);
});

test("the tool requires --today and refuses a malformed one", async () => {
  await assert.rejects(execute(process.execPath, [script, "--check"]), (error: { stderr: string }) =>
    /--today is required/.test(error.stderr),
  );
  await assert.rejects(execute(process.execPath, [script, "--today"]), (error: { stderr: string }) =>
    /--today is required/.test(error.stderr),
  );
  await assert.rejects(
    execute(process.execPath, [script, "--today", "tomorrow", "--check"]),
    (error: { stderr: string }) => /YYYY-MM-DD/.test(error.stderr),
  );
});

test("docs/dashboard/data.json is buildable with the last run's date as the reference day (CI fails when it is not)", async () => {
  const rendered = await renderDashboardData(".", "run-date");
  assert.ok(isWellFormedDashboardData(rendered, runDate));
  assert.equal((JSON.parse(rendered) as { referenceDay: string }).referenceDay, runDate);
  assert.equal(OUTPUT_FILE, "docs/dashboard/data.json");
  await execute(process.execPath, [script, "--today", "run-date", "--check"]);
});

test("source freshness is part of the data, with the targets file named as its source", () => {
  const data = buildDashboardData({
    thresholds,
    corpus,
    targets,
    today: runDate,
    freshness: [
      { importer: "go-1", targetDays: 60, rules: 1, lastReviewedAt: "2026-01-01", ageDays: 200, status: "missed" },
    ],
  });
  assert.equal(data.sourceFreshness.file, "tools/importers/freshness.json");
  assert.deepEqual(
    data.sourceFreshness.sources.map((s) => s.status),
    ["missed"],
  );
  assert.deepEqual(build().sourceFreshness.sources, []);
  assert.ok(data.definitions["freshnessTarget"] && data.definitions["freshnessAge"]);
});

test("the rendered data lists every importer source", async () => {
  const data = JSON.parse(await renderDashboardData(".", runDate)) as { sourceFreshness: { sources: unknown[] } };
  assert.ok(data.sourceFreshness.sources.length >= 30);
});
