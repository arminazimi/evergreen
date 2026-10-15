import { registerVersionScheme, VersError } from "../vers.js";
import type { VersionScheme } from "../vers.js";

// PEP 440 version pattern, as used by the reference `packaging` implementation.
const PATTERN = new RegExp(
  "^\\s*v?" +
    "(?:(?<epoch>[0-9]+)!)?" +
    "(?<release>[0-9]+(?:\\.[0-9]+)*)" +
    "(?<pre>[-_.]?(?<preL>alpha|a|beta|b|preview|pre|c|rc)[-_.]?(?<preN>[0-9]+)?)?" +
    "(?<post>(?:-(?<postN1>[0-9]+))|(?:[-_.]?(?<postL>post|rev|r)[-_.]?(?<postN2>[0-9]+)?))?" +
    "(?<dev>[-_.]?(?<devL>dev)[-_.]?(?<devN>[0-9]+)?)?" +
    "(?:\\+(?<local>[a-z0-9]+(?:[-_.][a-z0-9]+)*))?\\s*$",
  "i",
);

const NEGATIVE = Number.NEGATIVE_INFINITY;
const POSITIVE = Number.POSITIVE_INFINITY;

type LocalSegment = number | string;

interface Key {
  epoch: number;
  release: number[];
  pre: [number, number] | number;
  post: number;
  dev: number;
  local: LocalSegment[] | null;
}

const PRE_ORDER: Record<string, number> = { a: 0, b: 1, rc: 2 };

function normalizePre(letter: string): string {
  const lower = letter.toLowerCase();
  if (lower === "alpha") return "a";
  if (lower === "beta") return "b";
  if (["c", "pre", "preview"].includes(lower)) return "rc";
  return lower;
}

function key(value: string): Key {
  const match = PATTERN.exec(value);
  const groups = match?.groups;
  if (!groups) throw new VersError(`Invalid PEP 440 version "${value}".`);

  const release = groups.release!.split(".").map(Number);
  while (release.length > 1 && release[release.length - 1] === 0) release.pop();

  const hasPre = groups.preL !== undefined;
  const hasPost = groups.post !== undefined;
  const hasDev = groups.devL !== undefined;
  const pre: Key["pre"] = hasPre
    ? [PRE_ORDER[normalizePre(groups.preL!)]!, Number(groups.preN ?? 0)]
    : !hasPost && hasDev
      ? NEGATIVE
      : POSITIVE;
  const post = hasPost ? Number(groups.postN1 ?? groups.postN2 ?? 0) : NEGATIVE;
  const dev = hasDev ? Number(groups.devN ?? 0) : POSITIVE;
  const local = groups.local
    ? groups.local
        .toLowerCase()
        .split(/[-_.]/)
        .map((segment) => (/^[0-9]+$/.test(segment) ? Number(segment) : segment))
    : null;

  return { epoch: Number(groups.epoch ?? 0), release, pre, post, dev, local };
}

function compareNumbers(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareRelease(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = compareNumbers(left[index] ?? 0, right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function comparePre(left: Key["pre"], right: Key["pre"]): number {
  if (typeof left === "number" || typeof right === "number") {
    const a = typeof left === "number" ? left : 0;
    const b = typeof right === "number" ? right : 0;
    return compareNumbers(a, b);
  }
  return compareNumbers(left[0], right[0]) || compareNumbers(left[1], right[1]);
}

// Local versions: absent sorts first; numeric segments sort after alphanumeric ones.
function compareLocal(left: LocalSegment[] | null, right: LocalSegment[] | null): number {
  if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    if (typeof a === "number" && typeof b === "number") {
      if (a !== b) return compareNumbers(a, b);
    } else if (typeof a === "number") {
      return 1;
    } else if (typeof b === "number") {
      return -1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

/** PEP 440 ordering for Python packages and runtimes. */
export const pep440Scheme: VersionScheme = {
  names: ["pypi"],
  compare(left, right) {
    const a = key(left);
    const b = key(right);
    return (
      compareNumbers(a.epoch, b.epoch) ||
      compareRelease(a.release, b.release) ||
      comparePre(a.pre, b.pre) ||
      compareNumbers(a.post, b.post) ||
      compareNumbers(a.dev, b.dev) ||
      compareLocal(a.local, b.local)
    );
  },
};

registerVersionScheme(pep440Scheme);
