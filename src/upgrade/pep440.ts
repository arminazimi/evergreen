/** A PEP 440 version, reduced to the parts specifier matching needs. */
export interface ParsedVersion {
  readonly epoch: number;
  readonly release: readonly number[];
  readonly pre?: { readonly stage: number; readonly number: number };
  readonly post?: number;
  readonly dev?: number;
  readonly local?: string;
}

const VERSION_PATTERN =
  /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(a|b|c|rc|alpha|beta|pre|preview)[-_.]?(\d*))?(?:(?:-(\d+))|(?:[-_.]?(post|rev|r)[-_.]?(\d*)))?(?:[-_.]?dev[-_.]?(\d*))?(?:\+([a-z0-9]+(?:[-_.][a-z0-9]+)*))?$/i;

function preStage(label: string): number {
  const lowered = label.toLowerCase();
  if (lowered === "a" || lowered === "alpha") return 0;
  if (lowered === "b" || lowered === "beta") return 1;
  return 2;
}

function optionalNumber(value: string | undefined): number {
  return value === undefined || value === "" ? 0 : Number.parseInt(value, 10);
}

/** Parses a PEP 440 version. Returns undefined when the text is not a version this matcher understands. */
export function parseVersion(text: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(text.trim());
  if (!match?.[2]) return undefined;
  const release = match[2].split(".").map((part) => Number.parseInt(part, 10));
  if (release.some((part) => !Number.isFinite(part))) return undefined;
  const version: {
    epoch: number;
    release: readonly number[];
    pre?: { stage: number; number: number };
    post?: number;
    dev?: number;
    local?: string;
  } = {
    epoch: optionalNumber(match[1]),
    release,
  };
  if (match[3] !== undefined) version.pre = { stage: preStage(match[3]), number: optionalNumber(match[4]) };
  if (match[5] !== undefined) version.post = optionalNumber(match[5]);
  else if (match[6] !== undefined) version.post = optionalNumber(match[7]);
  if (match[8] !== undefined) version.dev = optionalNumber(match[8]);
  if (match[9] !== undefined) version.local = match[9].toLowerCase().replace(/[-_.]/g, ".");
  return version;
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function preKey(version: ParsedVersion): readonly [number, number, number] {
  if (version.pre) return [0, version.pre.stage, version.pre.number];
  // A development release without a pre-release sorts before every pre-release; a final release sorts after.
  if (version.dev !== undefined) return [-1, 0, 0];
  return [1, 0, 0];
}

/** Compares the public parts of two versions. Local labels are ignored, as PEP 440 requires for specifiers. */
export function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  return (
    left.epoch - right.epoch ||
    compareNumbers(left.release, right.release) ||
    compareNumbers(preKey(left), preKey(right)) ||
    (left.post === undefined ? -1 : left.post) - (right.post === undefined ? -1 : right.post) ||
    (left.dev === undefined ? 1 : left.dev) - (right.dev === undefined ? 1 : right.dev)
  );
}

function releaseHasPrefix(release: readonly number[], prefix: readonly number[]): boolean {
  for (let index = 0; index < prefix.length; index += 1) {
    if ((release[index] ?? 0) !== prefix[index]) return false;
  }
  return true;
}

function incrementLast(release: readonly number[]): number[] {
  const copy = release.length === 0 ? [0] : [...release];
  copy[copy.length - 1] = copy[copy.length - 1]! + 1;
  return copy;
}

/** The first non-zero segment is the one Poetry's caret bumps; all-zero releases bump the last segment. */
function caretUpper(release: readonly number[]): number[] {
  const index = release.findIndex((segment) => segment !== 0);
  if (index === -1) return incrementLast(release);
  const upper = release.slice(0, index + 1);
  upper[upper.length - 1] = upper[upper.length - 1]! + 1;
  return upper;
}

/** Poetry's tilde allows patch updates for three or more segments, and minor updates for fewer. */
function tildeUpper(release: readonly number[]): number[] {
  return incrementLast(release.length >= 3 ? release.slice(0, -1) : [...release]);
}

type Comparator =
  | { readonly kind: "any" }
  | { readonly kind: "prefix"; readonly prefix: readonly number[]; readonly negate: boolean }
  | { readonly kind: "exact"; readonly version: ParsedVersion; readonly negate: boolean }
  | { readonly kind: "range"; readonly op: "<" | "<=" | ">" | ">="; readonly version: ParsedVersion };

function upperVersion(epoch: number, release: readonly number[]): ParsedVersion {
  return { epoch, release };
}

function parseClause(text: string): readonly Comparator[] | undefined {
  const match = /^(===|==|!=|>=|<=|~=|>|<|\^|~)?\s*(.+)$/.exec(text.trim());
  if (!match) return undefined;
  const op = match[1];
  const raw = (match[2] ?? "").trim();
  if (!raw) return undefined;
  if (raw === "*") return op === undefined || op === "==" ? [{ kind: "any" }] : undefined;

  if (op === "^" || op === "~") {
    const version = parseVersion(raw);
    if (!version) return undefined;
    const upper = op === "^" ? caretUpper(version.release) : tildeUpper(version.release);
    return [
      { kind: "range", op: ">=", version },
      { kind: "range", op: "<", version: upperVersion(version.epoch, upper) },
    ];
  }

  if (op === "~=") {
    const version = parseVersion(raw);
    if (!version || version.release.length < 2) return undefined;
    const upper = incrementLast(version.release.slice(0, -1));
    return [
      { kind: "range", op: ">=", version },
      { kind: "range", op: "<", version: upperVersion(version.epoch, upper) },
    ];
  }

  if (op === ">" || op === ">=" || op === "<" || op === "<=") {
    const version = parseVersion(raw);
    return version ? [{ kind: "range", op, version }] : undefined;
  }

  const negate = op === "!=";
  if (raw.endsWith(".*")) {
    const prefixVersion = parseVersion(raw.slice(0, -2));
    if (
      !prefixVersion ||
      prefixVersion.pre ||
      prefixVersion.post !== undefined ||
      prefixVersion.dev !== undefined ||
      prefixVersion.local !== undefined
    ) {
      return undefined;
    }
    return [{ kind: "prefix", prefix: prefixVersion.release, negate }];
  }
  const version = parseVersion(raw);
  if (!version) return undefined;
  return [{ kind: "exact", version, negate }];
}

function matchesComparator(comparator: Comparator, version: ParsedVersion): boolean {
  if (comparator.kind === "any") return true;
  if (comparator.kind === "prefix") {
    const matches = releaseHasPrefix(version.release, comparator.prefix);
    return comparator.negate ? !matches : matches;
  }
  if (comparator.kind === "exact") {
    const same =
      compareVersions(version, comparator.version) === 0 &&
      (comparator.version.local === undefined || comparator.version.local === version.local);
    return comparator.negate ? !same : same;
  }
  const comparison = compareVersions(version, comparator.version);
  switch (comparator.op) {
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
  }
}

function matchesAll(text: string, version: ParsedVersion): boolean | undefined {
  // Poetry writes AND sets with commas, and also accepts whitespace between comparators.
  const parts = text.split(",").flatMap((part) =>
    part
      .trim()
      .replace(/\s+(?=[<>=!~^])/g, ",")
      .split(","),
  );
  if (parts.length === 0) return undefined;
  for (const part of parts) {
    if (!part.trim()) return undefined;
    const comparators = parseClause(part);
    if (!comparators) return undefined;
    for (const comparator of comparators) {
      if (!matchesComparator(comparator, version)) return false;
    }
  }
  return true;
}

/**
 * Whether a specifier accepts a version. It understands PEP 440 (`>=`, `<=`, `<`, `>`, `==` with `.*`, `!=`,
 * `~=`, and comma-joined sets) and Poetry's `^`, `~`, and `||` forms. `*` matches every version.
 * Returns undefined when either side cannot be parsed; callers report that as `unknown`, never as a match.
 */
export function matchesSpecifier(specifier: string, versionText: string): boolean | undefined {
  const trimmed = specifier.trim();
  if (!trimmed) return undefined;
  const version = parseVersion(versionText);
  if (!version) return undefined;
  const alternatives = trimmed.split("||");
  if (alternatives.some((alternative) => !alternative.trim())) return undefined;
  let unknown = false;
  for (const alternative of alternatives) {
    const matches = matchesAll(alternative.trim(), version);
    if (matches === undefined) unknown = true;
    else if (matches) return true;
  }
  return unknown ? undefined : false;
}
