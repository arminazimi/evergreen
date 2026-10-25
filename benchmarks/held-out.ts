// Scores Evergreen on the held-out set: `npm run validate:held-out`.
//
// The set is chosen by a rule fixed before scanning and its ground truth was committed before the first scan
// (benchmarks/held-out/label.ts, decision 0013). Findings are compared by family (rule id prefix), path, and
// line, and only for the families in the file's `scope`. Unlike the main corpus, the run reports its numbers
// and never fails the build: a mismatch is information about generalization, not a regression.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { ensureCorpusCacheEntry, resolveCorpusCacheDir } from "./corpus-cache.js";
import { inBatches, resolveCorpusConcurrency } from "./corpus-harness.js";
import { fetchWith, isCheckoutUsable, resolveFetchStrategy } from "./corpus-fetch.js";
import { parseOutputPath } from "./corpus-report.js";

export interface HeldOutEntry {
  repository: string;
  commit: string;
  ecosystem: string;
  selection: "blind";
  expected: Array<{ family: string; path: string; line: number }>;
}

export interface HeldOutScore {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  unexpected: string[];
  missing: string[];
}

const key = (family: string, path: string, line: number | undefined): string => `${family}:${path}:${line ?? ""}`;

/** The family of `ruleId` in `scope`, if any ("github-actions.checkout.node20" belongs to "github-actions.checkout"). */
export const familyOf = (ruleId: string, scope: readonly string[]): string | undefined => scope.find((family) => ruleId === family || ruleId.startsWith(`${family}.`));

/** Compares in-scope findings with the ground truth of one repository; several rules on one line count once. */
export function scoreHeldOut(findings: ReadonlyArray<{ ruleId: string; path: string; line?: number }>, expected: HeldOutEntry["expected"], scope: readonly string[]): HeldOutScore {
  const actual = new Set(findings.flatMap((finding) => { const family = familyOf(finding.ruleId, scope); return family ? [key(family, finding.path, finding.line)] : []; }));
  const wanted = new Set(expected.map((item) => key(item.family, item.path, item.line)));
  const unexpected = [...actual].filter((item) => !wanted.has(item)).sort();
  const missing = [...wanted].filter((item) => !actual.has(item)).sort();
  const truePositives = actual.size - unexpected.length;
  const ratio = (part: number, total: number) => Number((total === 0 ? 1 : part / total).toFixed(4));
  return { truePositives, falsePositives: unexpected.length, falseNegatives: missing.length, precision: ratio(truePositives, actual.size), recall: ratio(truePositives, wanted.size), unexpected, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = JSON.parse(await readFile(resolve("benchmarks/held-out-repositories.json"), "utf8")) as { scope: string[]; repositories: HeldOutEntry[] };
  const strategy = resolveFetchStrategy();
  const cacheDir = resolveCorpusCacheDir();
  const root = await mkdtemp(join(tmpdir(), "evergreen-held-out-"));
  try {
    const rows = await inBatches(file.repositories, resolveCorpusConcurrency(), async (entry, index) => {
      const fetchInto = async (directory: string) => { await fetchWith(strategy, directory, entry); };
      const path = cacheDir
        ? (await ensureCorpusCacheEntry(cacheDir, entry as never, fetchInto, (existing) => isCheckoutUsable(existing, strategy))).path
        : await (async () => { const target = join(root, String(index)); await fetchInto(target); return target; })();
      const scan = await scanRepository(path, builtInDetectors);
      const findings = scan.findings.filter((finding) => finding.dependencyPath === undefined).map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path, ...(finding.location.line === undefined ? {} : { line: finding.location.line }) }));
      return { repository: entry.repository, commit: entry.commit, ...scoreHeldOut(findings, entry.expected, file.scope) };
    });
    const total = rows.reduce((sum, row) => ({ tp: sum.tp + row.truePositives, fp: sum.fp + row.falsePositives, fn: sum.fn + row.falseNegatives }), { tp: 0, fp: 0, fn: 0 });
    const summary = {
      repositories: rows.length,
      truePositives: total.tp,
      falsePositives: total.fp,
      falseNegatives: total.fn,
      precision: Number((total.tp + total.fp === 0 ? 1 : total.tp / (total.tp + total.fp)).toFixed(4)),
      recall: Number((total.tp + total.fn === 0 ? 1 : total.tp / (total.tp + total.fn)).toFixed(4)),
    };
    for (const row of rows) for (const line of [...row.unexpected.map((item) => `UNEXPECTED ${row.repository} ${item}`), ...row.missing.map((item) => `MISSING    ${row.repository} ${item}`)]) console.log(line);
    console.log(`held-out: ${summary.repositories} repositories, ${summary.truePositives} true positives, ${summary.falsePositives} false positives, ${summary.falseNegatives} false negatives, precision ${summary.precision}, recall ${summary.recall}`);
    const output = parseOutputPath();
    if (output) await writeFile(resolve(output), `${JSON.stringify({ schemaVersion: "evergreen.held-out-result.v1", scope: file.scope, summary, repositories: rows }, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
