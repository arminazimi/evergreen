import { registerVersionScheme, VersError } from "../vers.js";
import type { VersionScheme } from "../vers.js";

interface NuGetVersion {
  numbers: [bigint, bigint, bigint, bigint];
  release: string[];
}

const PATTERN = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\s*$/;

function parse(value: string): NuGetVersion {
  const match = PATTERN.exec(value);
  if (!match) throw new VersError(`Invalid NuGet version "${value}".`);
  const [, major, minor, patch, revision, release] = match;
  return {
    numbers: [BigInt(major!), BigInt(minor ?? 0), BigInt(patch ?? 0), BigInt(revision ?? 0)],
    release: release ? release.split(".") : [],
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const difference = BigInt(left) - BigInt(right);
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  }
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b ? 0 : a < b ? -1 : 1;
}

/** NuGet version ordering: four numeric parts, SemVer 2.0 pre-release rules, case-insensitive labels, build metadata ignored. */
export const nugetScheme: VersionScheme = {
  names: ["nuget"],
  compare(left, right) {
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < 4; index++) {
      const difference = a.numbers[index]! - b.numbers[index]!;
      if (difference !== 0n) return difference < 0n ? -1 : 1;
    }
    if (a.release.length === 0 || b.release.length === 0) {
      return a.release.length === b.release.length ? 0 : a.release.length === 0 ? 1 : -1;
    }
    for (let index = 0; index < Math.max(a.release.length, b.release.length); index++) {
      const x = a.release[index];
      const y = b.release[index];
      if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
      const result = compareIdentifier(x, y);
      if (result !== 0) return result;
    }
    return 0;
  },
};

registerVersionScheme(nugetScheme);
