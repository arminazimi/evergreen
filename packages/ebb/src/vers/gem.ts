import { registerVersionScheme, VersError } from "../vers.js";
import type { VersionScheme } from "../vers.js";

// A port of Gem::Version#<=> (RubyGems 3).

const VALID = /^\s*([0-9]+(?:\.[0-9a-zA-Z]+)*(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)?\s*$/;

type Segment = bigint | string;

function segments(value: string): Segment[] {
  const match = VALID.exec(value);
  if (!match || !match[1]) throw new VersError(`Invalid RubyGems version "${value}".`);
  const dotted = match[1].replace(/-/g, ".pre.");
  return (dotted.match(/[0-9]+|[a-z]+/gi) ?? []).map((part) => (/^\d+$/.test(part) ? BigInt(part) : part));
}

// Trailing zeros are dropped from the numeric part and from the pre-release part separately.
function canonical(parts: Segment[]): Segment[] {
  const firstString = parts.findIndex((part) => typeof part === "string");
  const numeric = firstString === -1 ? parts : parts.slice(0, firstString);
  const rest = firstString === -1 ? [] : parts.slice(firstString);
  const trim = (list: Segment[]) => {
    const copy = [...list];
    while (copy.length > 0 && copy[copy.length - 1] === 0n) copy.pop();
    return copy;
  };
  return [...trim(numeric), ...trim(rest)];
}

/** RubyGems version ordering for gems; any version with a letter is a pre-release and sorts before its release. */
export const gemScheme: VersionScheme = {
  names: ["gem"],
  compare(left, right) {
    const a = segments(left);
    const b = segments(right);
    // Equality uses canonical segments; ordering uses the raw segments, as Gem::Version#<=> does.
    const ca = canonical(a);
    const cb = canonical(b);
    if (ca.length === cb.length && ca.every((part, index) => part === cb[index])) return 0;
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
      const x = a[index] ?? 0n;
      const y = b[index] ?? 0n;
      if (x === y) continue;
      if (typeof x === "string" && typeof y === "bigint") return -1;
      if (typeof x === "bigint" && typeof y === "string") return 1;
      return x < y ? -1 : 1;
    }
    return 0;
  },
};

registerVersionScheme(gemScheme);
