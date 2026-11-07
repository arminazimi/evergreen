/**
 * Pure evaluator for a RubyGems requirement on the Ruby runtime, such as the Gemfile directive
 * `ruby '>= 2.5.0', '< 2.7.0'`.
 *
 * `allowedRubyLines` returns the release lines (`2.6`) the requirement can resolve to, or `undefined` when it is
 * unbounded above or has a form this parser does not read. A `!=` clause is ignored, which only widens the set.
 * Nothing is evaluated and Bundler is never run.
 */

type Version = readonly [number, number, number];

/** Release lines Evergreen can judge; an unlisted line is never reported. */
const KNOWN_LINES: ReadonlyArray<readonly [number, number]> = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((minor) => [2, minor] as const),
  ...[0, 1, 2, 3, 4].map((minor) => [3, minor] as const),
];

const CEILING: Version = [99, 0, 0];
const FLOOR: Version = [0, 0, 0];
const CLAUSE = /^(~>|>=|<=|!=|=|>|<)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.\d+)*$/;

/** One requirement string shape: an optional operator and a dotted version. */
export const RUBY_REQUIREMENT = CLAUSE;

function compare(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

interface Range {
  lo: Version;
  hi: Version;
}

/** The range one clause allows, `null` for a clause that does not narrow, `undefined` when unreadable. */
function clauseRange(clause: string): Range | null | undefined {
  const match = CLAUSE.exec(clause.trim());
  if (!match) return undefined;
  const [, operator = "=", majorText = "", minorText, patchText] = match;
  const major = Number(majorText);
  const minor = minorText === undefined ? undefined : Number(minorText);
  const patch = patchText === undefined ? undefined : Number(patchText);
  const lo: Version = [major, minor ?? 0, patch ?? 0];
  const next: Version = patch !== undefined ? [major, lo[1], patch + 1] : [major, (minor ?? -1) + 1, 0];
  const exact: Version = minor === undefined ? [major + 1, 0, 0] : next;
  return operatorRange(operator, lo, next, exact, patch === undefined ? [major + 1, 0, 0] : [major, lo[1] + 1, 0]);
}

function operatorRange(
  operator: string,
  lo: Version,
  next: Version,
  exact: Version,
  pessimistic: Version,
): Range | null {
  if (operator === "~>") return { lo, hi: pessimistic };
  if (operator === ">=") return { lo, hi: CEILING };
  if (operator === ">") return { lo: next, hi: CEILING };
  if (operator === "<") return { lo: FLOOR, hi: lo };
  if (operator === "<=") return { lo: FLOOR, hi: exact };
  if (operator === "!=") return null;
  return { lo, hi: exact };
}

/** The release lines every requirement allows together, or `undefined` for an unreadable or unbounded set. */
export function allowedRubyLines(requirements: readonly string[]): string[] | undefined {
  let lo = FLOOR;
  let hi = CEILING;
  for (const requirement of requirements) {
    const range = clauseRange(requirement);
    if (range === undefined) return undefined;
    if (range === null) continue;
    if (compare(range.lo, lo) > 0) lo = range.lo;
    if (compare(range.hi, hi) < 0) hi = range.hi;
  }
  if (compare(hi, CEILING) === 0) return undefined;
  const lines = KNOWN_LINES.filter(
    ([major, minor]) => compare(lo, [major, minor + 1, 0]) < 0 && compare([major, minor, 0], hi) < 0,
  ).map(([major, minor]) => `${major}.${minor}`);
  return lines.length === 0 ? undefined : lines;
}
