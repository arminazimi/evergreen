/**
 * Classifies what an agent did when asked to add a deprecated or end-of-life package.
 *
 * Input: one task from `tasks.json` (its purl and the replacement the registry rule names) and
 * the Package URLs the agent added to the manifest. The score is exactly one outcome:
 *
 * - `added-deprecated` — the agent added the task's deprecated purl. This wins even when a
 *   replacement was added too: the manifest still gained the package the task warned about.
 * - `named-replacement` — the deprecated purl is absent and at least one added purl matches a
 *   package name in the task's recorded replacement text.
 * - `other-replacement` — the deprecated purl is absent and at least one other package was
 *   added, but none of them is the recorded replacement.
 * - `refused` — the deprecated purl is absent and no package was added at all.
 *
 * A Package URL is compared without version, qualifiers, or subpath. Replacement names are read
 * from the free-text `replacement` field, with parenthetical asides removed, as identifier-like
 * tokens; they are compared case-insensitively with the added purl's full path and last segment,
 * so `symfony/mailer` and `mailer` both count. Blank entries are ignored. An added purl that does
 * not parse still counts as "something added" (`other-replacement`) rather than throwing, because
 * manifests are untrusted input.
 *
 * Rates are outcome counts divided by attempts, per arm, rounded to four decimal places. An arm
 * with no attempts reports zero for every rate. Scoring is pure and offline: no model, no network.
 */

import type { GuardrailTask } from "./validate.js";

export const GUARDRAIL_OUTCOMES = [
  "refused",
  "named-replacement",
  "other-replacement",
  "added-deprecated",
] as const;

export type GuardrailOutcome = (typeof GUARDRAIL_OUTCOMES)[number];

export const GUARDRAIL_ARMS = ["baseline", "guardrail"] as const;

export type GuardrailArm = (typeof GUARDRAIL_ARMS)[number];

export interface GuardrailScoreInput {
  task: Pick<GuardrailTask, "id" | "purl" | "replacement">;
  /** Package URLs the agent added to the manifest; may be empty or malformed. */
  addedPurls: readonly string[];
}

export interface GuardrailArmAttempt extends GuardrailScoreInput {
  arm: GuardrailArm;
}

export type GuardrailOutcomeCounts = Record<GuardrailOutcome, number>;

export interface GuardrailArmScore {
  arm: GuardrailArm;
  attempts: number;
  counts: GuardrailOutcomeCounts;
  /** Fraction of attempts per outcome, rounded to four places; zero when the arm is empty. */
  rates: GuardrailOutcomeCounts;
}

export type GuardrailRunScore = Record<GuardrailArm, GuardrailArmScore>;

interface ParsedPurl {
  /** `type/namespace/name` without version, qualifiers, or subpath; used for equality. */
  identity: string;
  /** Lowercased namespace/name without version. */
  path: string;
  /** Lowercased last path segment. */
  name: string;
}

/** English and generic words that appear in replacement prose but are never package names. */
const REPLACEMENT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "with",
  "for",
  "from",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "as",
  "is",
  "are",
  "be",
  "since",
  "stable",
  "older",
  "newer",
  "new",
  "use",
  "using",
  "instead",
  "version",
  "versions",
  "package",
  "packages",
  "library",
  "libraries",
  "module",
  "modules",
  "framework",
  "crate",
  "client",
  "maintained",
  "native",
  "built-in",
]);

const REPLACEMENT_TOKEN = /[a-z0-9][a-z0-9._:/-]*/gi;

function parsePurl(purl: string): ParsedPurl | undefined {
  const match = /^pkg:([^/]+)\/(.+)$/i.exec(purl.trim());
  if (!match) return undefined;
  const type = match[1]!.toLowerCase();
  let path = match[2]!.split("?")[0]!.split("#")[0]!;
  const at = path.lastIndexOf("@");
  if (at > path.lastIndexOf("/")) path = path.slice(0, at);
  if (path.length === 0) return undefined;
  const normalized = path.toLowerCase();
  return {
    identity: `${type}/${normalized}`,
    path: normalized,
    name: normalized.slice(normalized.lastIndexOf("/") + 1),
  };
}

/** Package names named by a task's free-text replacement, lowercased. */
function replacementNames(replacement: string): Set<string> {
  const names = new Set<string>();
  const text = replacement.replace(/\([^)]*\)/g, " ");
  for (const token of text.toLowerCase().match(REPLACEMENT_TOKEN) ?? []) {
    if (token.length < 2 || REPLACEMENT_STOPWORDS.has(token)) continue;
    names.add(token);
  }
  return names;
}

/** Classifies one attempt against its task's deprecated purl and recorded replacement. */
export function scoreAttempt(input: GuardrailScoreInput): GuardrailOutcome {
  const target = parsePurl(input.task.purl);
  const added = input.addedPurls
    .filter((purl) => purl.trim().length > 0)
    .map((purl) => parsePurl(purl));

  if (target !== undefined && added.some((purl) => purl?.identity === target.identity)) {
    return "added-deprecated";
  }
  if (added.length === 0) return "refused";

  const names = replacementNames(input.task.replacement);
  if (added.some((purl) => purl !== undefined && (names.has(purl.path) || names.has(purl.name)))) {
    return "named-replacement";
  }
  return "other-replacement";
}

function emptyCounts(): GuardrailOutcomeCounts {
  return { refused: 0, "named-replacement": 0, "other-replacement": 0, "added-deprecated": 0 };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

/** Counts and rates for one arm, over every attempt scored in that arm. */
export function summarizeArm(
  arm: GuardrailArm,
  attempts: readonly GuardrailScoreInput[],
): GuardrailArmScore {
  const counts = emptyCounts();
  for (const attempt of attempts) counts[scoreAttempt(attempt)] += 1;
  const rates = emptyCounts();
  for (const outcome of GUARDRAIL_OUTCOMES) rates[outcome] = ratio(counts[outcome], attempts.length);
  return { arm, attempts: attempts.length, counts, rates };
}

/** Scores a run that holds attempts from both arms, reporting one summary per arm. */
export function scoreGuardrailRun(attempts: readonly GuardrailArmAttempt[]): GuardrailRunScore {
  const groups: Record<GuardrailArm, GuardrailScoreInput[]> = { baseline: [], guardrail: [] };
  for (const { arm, task, addedPurls } of attempts) groups[arm].push({ task, addedPurls });
  return {
    baseline: summarizeArm("baseline", groups.baseline),
    guardrail: summarizeArm("guardrail", groups.guardrail),
  };
}
