// Reads a `vers:` range from Evergreen's registry and decides which endoflife.date release cycles it covers.
//
// A rule may name one cycle (`>=20.0.0|<21.0.0`) or a group (`<22.0.0`, "22 and older"). The comparison keeps
// the two apart: one cycle is compared with that cycle's date, a group with the latest date among its cycles,
// because a group is only fully ended when the last member ends.

export type VersionRange = { kind: "range"; lower?: string; upper?: string } | { kind: "other" };

/** Parses the package-url version range. `vers:semver/>=20.0.0|<21.0.0` becomes lower `20.0.0`, upper `21.0.0`. */
export function parseVersionRange(vers: string): VersionRange {
  const match = /^vers:[^/]+\/(.*)$/.exec(vers);
  if (!match) return { kind: "other" };
  const body = match[1] ?? "";
  const lower = /(?:^|\|)>=([^|]+)/.exec(body)?.[1];
  const upper = /(?:^|\|)<([^|]+)/.exec(body)?.[1];
  if (!lower && !upper) return { kind: "other" };
  return { kind: "range", ...(lower ? { lower } : {}), ...(upper ? { upper } : {}) };
}

/** Numeric components of a version: `3.10.dev0` becomes `[3, 10]` and `22.04` becomes `[22, 4]`. */
export function versionParts(version: string): number[] {
  const cleaned = (version.trim().replace(/^v/i, "").split(/[-+]/, 1)[0] ?? "").trim();
  return cleaned
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/** Compares two numeric version component lists, padding the shorter one with zeros. */
export function compareVersions(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/** Whether a release cycle such as `20`, `3.10`, or `22.04` falls inside the rule's range. */
export function cycleInRange(cycle: string, range: VersionRange): boolean {
  if (range.kind !== "range") return false;
  const version = versionParts(cycle);
  if (version.length === 0) return false;
  if (range.lower && compareVersions(version, versionParts(range.lower)) < 0) return false;
  if (range.upper && compareVersions(version, versionParts(range.upper)) >= 0) return false;
  return true;
}
