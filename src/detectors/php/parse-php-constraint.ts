/**
 * Pure evaluator for a Composer `php` version constraint.
 *
 * `allowedPhpLines` returns the PHP release lines (`7.4`) a constraint can resolve to, or `undefined` when the
 * constraint is unbounded above, uses a form this parser does not read (`dev-` branches, `as` aliases), or is
 * malformed. A `!=` clause is ignored, which only widens the set. Nothing is evaluated and Composer is never run.
 */

type Version = readonly [number, number, number];

/** Release lines Evergreen can judge; an unlisted line is never reported. */
const KNOWN_LINES: ReadonlyArray<readonly [number, number]> = [
  ...[0, 1, 2, 3, 4].map((minor) => [7, minor] as const),
  ...[0, 1, 2, 3, 4, 5].map((minor) => [8, minor] as const),
];

const CEILING: Version = [99, 0, 0];
const FLOOR: Version = [0, 0, 0];
const TOKEN = /^(\^|~>?|>=|<=|==|!=|=|>|<)?v?(\d+)(?:\.(\d+|[*x]))?(?:\.(\d+|[*x]))?(?:-?[A-Za-z][\w.-]*)?$/;

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
  if (!match) return clause === "*" ? null : undefined;
  const [, operator = "", majorText = "", minorText, patchText] = match;
  const major = Number(majorText);
  const wild = (text: string | undefined): boolean => text === "*" || text === "x";
  const minor = minorText === undefined || wild(minorText) ? undefined : Number(minorText);
  const patch = patchText === undefined || wild(patchText) ? undefined : Number(patchText);
  const lo: Version = [major, minor ?? 0, patch ?? 0];
  // The exclusive bound that follows the last component written.
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

/** Rewrite a hyphen range such as `7.0 - 7.4` into `>=7.0 <7.5`-equivalent clauses. */
function expandHyphen(group: string): string {
  const match = /^(\S+)\s+-\s+(\S+)$/.exec(group.trim());
  if (!match) return group;
  const upper = /^(\d+)(?:\.(\d+))?$/.exec(match[2] ?? "");
  if (upper && upper[2] === undefined) return `>=${match[1]} <${Number(upper[1]) + 1}.0.0`;
  if (upper) return `>=${match[1]} <${upper[1]}.${Number(upper[2]) + 1}.0`;
  return `>=${match[1]} <=${match[2]}`;
}

function linesIn(range: Range): string[] {
  return KNOWN_LINES.filter(([major, minor]) => {
    const start: Version = [major, minor, 0];
    const end: Version = [major, minor + 1, 0];
    return compare(range.lo, end) < 0 && compare(start, range.hi) < 0;
  }).map(([major, minor]) => `${major}.${minor}`);
}

/** The release lines (`7.3`, `7.4`) the constraint can resolve to, or `undefined` when it is not bounded above. */
export function allowedPhpLines(constraint: string): string[] | undefined {
  if (constraint.length > 256 || /\bas\b|dev-|@dev/.test(constraint)) return undefined;
  const lines = new Set<string>();
  for (const alternative of constraint.split(/\s*\|\|?\s*/)) {
    const range = groupRange(expandHyphen(alternative));
    if (!range || compare(range.hi, CEILING) === 0) return undefined;
    for (const line of linesIn(range)) lines.add(line);
  }
  return lines.size === 0 ? undefined : [...lines].sort((a, b) => Number(a) - Number(b));
}
