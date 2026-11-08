// Maintainer tool for the manual-review pass (docs/validation/passes/manual-review.md). No network access.
//
//   npm run build --silent
//   node dist/benchmarks/manual-review/review.js sample --seed <text> [--per-ecosystem 40]
//   node dist/benchmarks/manual-review/review.js todo
//   node dist/benchmarks/manual-review/review.js record --file <review.json>
//   node dist/benchmarks/manual-review/review.js report [--json]
//
// `sample` draws a random sample of 30 to 50 repositories per ecosystem from the pinned corpus and stores the
// seed with it, so anyone can redraw the same list. `record` stores one hand review: who read the repository,
// when, and a verdict on every finding Evergreen reported plus every deprecation the reviewer found that it missed.
// `report` turns the stored verdicts into precision and recall with a 95% Wilson interval.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadPublicCorpus } from "../public-corpus.js";
import { isIsoDate } from "../../src/registry.js";
import { drawSample, wilsonInterval, type Interval } from "./stats.js";

export const SAMPLE_SCHEMA = "evergreen.manual-review-sample.v1" as const;
export const REVIEWS_SCHEMA = "evergreen.manual-review-log.v1" as const;
export const SAMPLE_FILE = "benchmarks/manual-review/sample.json";
export const REVIEWS_FILE = "benchmarks/manual-review/reviews.json";
export const MIN_PER_ECOSYSTEM = 30;
export const MAX_PER_ECOSYSTEM = 50;
export const DEFAULT_PER_ECOSYSTEM = 40;

export interface SampledRepository {
  repository: string;
  commit: string;
}

export interface SampleFile {
  schemaVersion: typeof SAMPLE_SCHEMA;
  seed: string;
  perEcosystem: number;
  /** Repositories in the corpus per ecosystem when the sample was drawn; a smaller ecosystem is taken whole. */
  corpusSize: Record<string, number>;
  ecosystems: Record<string, SampledRepository[]>;
}

export interface FindingVerdict {
  ruleId: string;
  path: string;
  line?: number;
  verdict: "correct" | "incorrect";
}

export interface MissedDeprecation {
  path: string;
  line?: number;
  note: string;
}

export interface ReviewEntry {
  repository: string;
  commit: string;
  ecosystem: string;
  reviewer: string;
  reviewedAt: string;
  findings: FindingVerdict[];
  missed: MissedDeprecation[];
  note?: string;
}

export interface ReviewsFile {
  schemaVersion: typeof REVIEWS_SCHEMA;
  entries: ReviewEntry[];
}

export interface Tally {
  sampled: number;
  reviewed: number;
  correct: number;
  incorrect: number;
  missed: number;
  precision: Interval;
  recall: Interval;
}

/** Draws the sample. Group names are the ecosystem names, so adding repositories to one ecosystem leaves the rest alone. */
export function buildSample(
  corpus: ReadonlyArray<SampledRepository & { ecosystem: string }>,
  seed: string,
  perEcosystem: number,
): SampleFile {
  if (seed.trim() === "") throw new Error("the sample needs a non-empty seed");
  if (!Number.isInteger(perEcosystem) || perEcosystem < MIN_PER_ECOSYSTEM || perEcosystem > MAX_PER_ECOSYSTEM) {
    throw new Error(`per-ecosystem must be a whole number from ${MIN_PER_ECOSYSTEM} to ${MAX_PER_ECOSYSTEM}`);
  }
  const byEcosystem = new Map<string, Map<string, string>>();
  for (const entry of corpus) {
    const group = byEcosystem.get(entry.ecosystem) ?? new Map<string, string>();
    group.set(entry.repository, entry.commit);
    byEcosystem.set(entry.ecosystem, group);
  }
  const corpusSize: Record<string, number> = {};
  const ecosystems: Record<string, SampledRepository[]> = {};
  for (const name of [...byEcosystem.keys()].sort()) {
    const group = byEcosystem.get(name) as Map<string, string>;
    corpusSize[name] = group.size;
    ecosystems[name] = drawSample([...group.keys()], perEcosystem, seed, name).map((repository) => ({
      repository,
      commit: group.get(repository) as string,
    }));
  }
  return { schemaVersion: SAMPLE_SCHEMA, seed, perEcosystem, corpusSize, ecosystems };
}

const problemsOfFinding = (finding: FindingVerdict, label: string): string[] => {
  const problems: string[] = [];
  if (!finding.ruleId || !finding.path) problems.push(`${label}: needs a ruleId and a path`);
  if (finding.verdict !== "correct" && finding.verdict !== "incorrect") {
    problems.push(`${label}: verdict must be "correct" or "incorrect"`);
  }
  return problems;
};

/** Everything wrong with a review entry, checked against the sample and the entries already stored. */
export function reviewProblems(entry: ReviewEntry, sample: SampleFile, stored: readonly ReviewEntry[]): string[] {
  const problems: string[] = [];
  const sampled = (sample.ecosystems[entry.ecosystem] ?? []).find(
    (item) => item.repository === entry.repository && item.commit === entry.commit,
  );
  if (!sampled) problems.push(`${entry.repository}@${entry.commit} is not in the ${entry.ecosystem} sample`);
  if (stored.some((item) => item.repository === entry.repository && item.commit === entry.commit)) {
    problems.push(`${entry.repository}@${entry.commit} already has a review`);
  }
  if (!entry.reviewer?.trim()) problems.push("the review needs a reviewer");
  if (!isIsoDate(entry.reviewedAt)) problems.push("reviewedAt must be a date (YYYY-MM-DD)");
  if (!Array.isArray(entry.findings) || !Array.isArray(entry.missed)) {
    return [...problems, "findings and missed must both be lists (empty when there is nothing to record)"];
  }
  entry.findings.forEach((finding, index) => problems.push(...problemsOfFinding(finding, `findings[${index}]`)));
  entry.missed.forEach((miss, index) => {
    if (!miss.path || !miss.note?.trim()) problems.push(`missed[${index}]: needs a path and a note`);
  });
  return problems;
}

const emptyTally = (sampled: number): Tally => ({
  sampled,
  reviewed: 0,
  correct: 0,
  incorrect: 0,
  missed: 0,
  precision: wilsonInterval(0, 0),
  recall: wilsonInterval(0, 0),
});

function finishTally(tally: Tally): Tally {
  const reported = tally.correct + tally.incorrect;
  return {
    ...tally,
    precision: wilsonInterval(tally.correct, reported),
    recall: wilsonInterval(tally.correct, tally.correct + tally.missed),
  };
}

/** Precision and recall per ecosystem and overall. Only reviewed repositories count. */
export function tallyReviews(
  sample: SampleFile,
  entries: readonly ReviewEntry[],
): { total: Tally; ecosystems: Record<string, Tally> } {
  const ecosystems: Record<string, Tally> = {};
  const total = emptyTally(0);
  for (const [name, list] of Object.entries(sample.ecosystems)) {
    const tally = emptyTally(list.length);
    for (const entry of entries.filter((item) => item.ecosystem === name)) {
      tally.reviewed += 1;
      tally.correct += entry.findings.filter((finding) => finding.verdict === "correct").length;
      tally.incorrect += entry.findings.filter((finding) => finding.verdict === "incorrect").length;
      tally.missed += entry.missed.length;
    }
    ecosystems[name] = finishTally(tally);
    for (const key of ["sampled", "reviewed", "correct", "incorrect", "missed"] as const) total[key] += tally[key];
  }
  return { total: finishTally(total), ecosystems };
}

/** Sampled repositories with no stored review yet. */
export function unreviewed(
  sample: SampleFile,
  entries: readonly ReviewEntry[],
): Array<SampledRepository & { ecosystem: string }> {
  const done = new Set(entries.map((entry) => `${entry.repository}@${entry.commit}`));
  return Object.entries(sample.ecosystems).flatMap(([ecosystem, list]) =>
    list.filter((item) => !done.has(`${item.repository}@${item.commit}`)).map((item) => ({ ecosystem, ...item })),
  );
}

const percent = (interval: Interval): string =>
  interval.estimate === null
    ? "n/a"
    : `${interval.estimate.toFixed(4)} (95% ${(interval.low ?? 0).toFixed(4)}–${(interval.high ?? 0).toFixed(4)})`;

export function formatReport(report: ReturnType<typeof tallyReviews>, seed: string): string {
  const rows = [...Object.entries(report.ecosystems), ["all", report.total] as const];
  const lines = rows.map(
    ([name, tally]) =>
      `${name}: ${tally.reviewed}/${tally.sampled} reviewed, ${tally.correct} correct, ${tally.incorrect} incorrect, ${tally.missed} missed; precision ${percent(tally.precision)}; recall ${percent(tally.recall)}`,
  );
  return [`manual review (seed "${seed}")`, ...lines].join("\n");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(file), "utf8")) as T;
}

const writeJson = (file: string, value: unknown) => writeFile(resolve(file), `${JSON.stringify(value, null, 2)}\n`);

const flag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

async function loadReviews(): Promise<ReviewsFile> {
  return readJson<ReviewsFile>(REVIEWS_FILE).catch(() => ({ schemaVersion: REVIEWS_SCHEMA, entries: [] }));
}

async function runRecord(file: string | undefined): Promise<void> {
  if (!file) throw new Error("record needs --file <review.json>");
  const entry = await readJson<ReviewEntry>(file);
  const sample = await readJson<SampleFile>(SAMPLE_FILE);
  const reviews = await loadReviews();
  const problems = reviewProblems(entry, sample, reviews.entries);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  reviews.entries.push(entry);
  reviews.entries.sort((a, b) => `${a.ecosystem}/${a.repository}`.localeCompare(`${b.ecosystem}/${b.repository}`));
  await writeJson(REVIEWS_FILE, reviews);
  console.log(`recorded ${entry.repository}@${entry.commit} reviewed by ${entry.reviewer}`);
}

async function runSample(args: readonly string[]): Promise<void> {
  const seed = flag(args, "seed");
  if (!seed) throw new Error("sample needs --seed <text>; the seed is stored with the sample");
  const corpus = await loadPublicCorpus();
  const size = Number(flag(args, "per-ecosystem") ?? DEFAULT_PER_ECOSYSTEM);
  const sample = buildSample(corpus.repositories, seed, size);
  await writeJson(SAMPLE_FILE, sample);
  console.log(`sampled ${Object.values(sample.ecosystems).flat().length} repositories, seed "${seed}"`);
}

async function runReport(json: boolean): Promise<void> {
  const sample = await readJson<SampleFile>(SAMPLE_FILE);
  const report = tallyReviews(sample, (await loadReviews()).entries);
  console.log(json ? JSON.stringify({ seed: sample.seed, ...report }, null, 2) : formatReport(report, sample.seed));
}

async function main(args: readonly string[]): Promise<void> {
  const [command] = args;
  if (command === "sample") return runSample(args);
  if (command === "record") return runRecord(flag(args, "file"));
  if (command === "report") return runReport(args.includes("--json"));
  if (command === "todo") {
    const rows = unreviewed(await readJson<SampleFile>(SAMPLE_FILE), (await loadReviews()).entries);
    for (const row of rows) console.log(`${row.ecosystem} ${row.repository} ${row.commit}`);
    console.log(`${rows.length} sampled repositories left to review`);
    return;
  }
  throw new Error("usage: review.js sample --seed <text> | todo | record --file <review.json> | report [--json]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
