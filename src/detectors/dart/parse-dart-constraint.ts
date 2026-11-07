/**
 * Pure evaluator for a Dart SDK version constraint (`environment.sdk`, lock `sdks.dart`).
 *
 * `allowedDartLines` returns the Dart release lines (`3.8`, `2.19`) a constraint can resolve to, or
 * `undefined` when the constraint is unbounded above, uses a form this parser does not read, or is
 * malformed. A constraint that admits a supported or unjudged line is still returned when that line
 * is listed in `KNOWN_LINES`; the detector then refuses to report because that line has no
 * end-of-support rule. Nothing is evaluated and the Dart SDK is never run.
 */

type Version = readonly [number, number, number];

/** Release lines Evergreen can judge, including the current supported line so a constraint that admits it is refused. */
const KNOWN_LINES: ReadonlyArray<readonly [number, number]> = [
  ...[12, 13, 14, 15, 16, 17, 18, 19].map((minor) => [2, minor] as const),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((minor) => [3, minor] as const),
];

const CEILING: Version = [99, 0, 0];
const FLOOR: Version = [0, 0, 0];
const TOKEN =
  /^(\^|~>?|>=|<=|==|!=|=|>|<)?v?(\d+)(?:\.(\d+|[*x]))?(?:\.(\d+|[*x]))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function compare(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

interface Range {
  lo: Version;
  hi: Version;
}

/** The range one clause allows, or `null` for a clause that does not narrow, or `undefined` if unreadable. */
function clauseRange(clause: string): Range | null | undefined {
  const match = TOKEN.exec(clause);
  if (!match) return clause === "*" || clause === "any" ? null : undefined;
  const [, operator = "", majorText = "", minorText, patchText] = match;
  const major = Number(majorText);
  const wild = (text: string | undefined): boolean => text === "*" || text === "x";
  const minor = minorText === undefined || wild(minorText) ? undefined : Number(minorText);
  const patch = patchText === undefined || wild(patchText) ? undefined : Number(patchText);
  const lo: Version = [major, minor ?? 0, patch ?? 0];
  const next: Version =
    minor === undefined ? [major + 1, 0, 0] : patch === undefined ? [major, minor + 1, 0] : [major, minor, patch + 1];
  const tilde: Version = minor === undefined || patch === undefined ? [major + 1, 0, 0] : [major, minor + 1, 0];
  return operatorRange(operator, lo, next, tilde, [major + 1, 0, 0]);
}

function operatorRange(operator: string, lo: Version, next: Version, tilde: Version, caret: Version): Range | null {
  if (operator === "^") return { lo, hi: caret };
  if (operator === "~" || operator === "~>") return { lo, hi: tilde };
  if (operator === ">=") return { lo, hi: CEILING };
  if (operator === ">") return { lo: next, hi: CEILING };
  if (operator === "<") return { lo: FLOOR, hi: lo };
  if (operator === "<=") return { lo: FLOOR, hi: next };
  if (operator === "!=") return null;
  return { lo, hi: next };
}

/** Intersect every clause of one `AND` group; `undefined` when a clause is unreadable. */
function groupRange(group: string): Range | undefined {
  const clauses = group
    .replace(/\s*(>=|<=|==|!=|~>|[<>=^~])\s+/g, "$1")
    .replace(/\s*,\s*/g, " ")
    .trim()
    .split(/\s+/);
  let lo = FLOOR;
  let hi = CEILING;
  for (const clause of clauses) {
    const range = clauseRange(clause);
    if (range === undefined) return undefined;
    if (range === null) continue;
    if (compare(range.lo, lo) > 0) lo = range.lo;
    if (compare(range.hi, hi) < 0) hi = range.hi;
  }
  return { lo, hi };
}

function linesIn(range: Range): string[] {
  return KNOWN_LINES.filter(([major, minor]) => {
    const start: Version = [major, minor, 0];
    const end: Version = [major, minor + 1, 0];
    return compare(range.lo, end) < 0 && compare(start, range.hi) < 0;
  }).map(([major, minor]) => `${major}.${minor}`);
}

/**
 * The release lines (`3.8`, `2.19`) the constraint can resolve to, or `undefined` when it is not bounded
 * above or cannot be read.
 */
export function allowedDartLines(constraint: string): string[] | undefined {
  if (constraint.length > 256 || /\$\{|`/.test(constraint)) return undefined;
  const lines = new Set<string>();
  for (const alternative of constraint.split(/\s*\|\|?\s*/)) {
    const range = groupRange(alternative);
    if (!range || compare(range.hi, CEILING) === 0) return undefined;
    for (const line of linesIn(range)) lines.add(line);
  }
  return lines.size === 0
    ? undefined
    : [...lines].sort((a, b) => {
        const [aMaj = 0, aMin = 0] = a.split(".").map(Number);
        const [bMaj = 0, bMin = 0] = b.split(".").map(Number);
        return aMaj - bMaj || aMin - bMin;
      });
}
