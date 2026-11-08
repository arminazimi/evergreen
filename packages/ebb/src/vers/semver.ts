import semver from "semver";

import { registerVersionScheme, VersError } from "../vers.js";
import type { VersionScheme } from "../vers.js";

function parse(value: string): semver.SemVer {
  const parsed = semver.parse(value, { loose: true });
  if (parsed) return parsed;
  // Composer and Go-style short versions: 1, 1.2, v1.2 (optionally with a pre-release).
  const short = /^v?(\d+)(?:\.(\d+))?(-[0-9A-Za-z.-]+)?$/.exec(value);
  const padded = short ? semver.parse(`${short[1]}.${short[2] ?? "0"}.0${short[3] ?? ""}`, { loose: true }) : null;
  if (padded) return padded;
  throw new VersError(`Invalid semver version "${value}".`);
}

/** Semantic Versioning 2.0 ordering for npm, cargo, golang, composer, and generic semver ranges. Build metadata is ignored. */
export const semverScheme: VersionScheme = {
  names: ["semver", "npm", "cargo", "golang", "composer"],
  compare(left, right) {
    return semver.compare(parse(left), parse(right));
  },
};

registerVersionScheme(semverScheme);
