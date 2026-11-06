import { test } from "node:test";

import { matchesComposerConstraint } from "../../src/upgrade/composer-lock.js";
import { matchesDartConstraint } from "../../src/upgrade/dart-sdk.js";
import { matchesSpecifier as matchesPep440Specifier } from "../../src/upgrade/pep440.js";
import { checkRoundTrip, checkToleratesArbitraryText, type RoundTripCase } from "./harness.js";

/**
 * Property tests for the parsers that read a single string rather than a file: package URLs,
 * version ranges, spec strings, and the constraint matchers behind the upgrade analyzers.
 *
 * Each case writes one canonical string and asserts the parse result carries the encoded values
 * back unchanged, that re-parsing is stable, and that arbitrary text never crashes the parser.
 */

const CASES: readonly RoundTripCase[] = [
  {
    name: "parseRange",
    file: ({ name, version }) => `${name}..${version}`,
    names: "zzmark",
    versions: "9.8.7",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseNpmPackage",
    file: ({ name, version }) => `${name}@${version}`,
    names: "zzmark|@zzmark/sub",
    versions: "9.8.7",
    markers: ({ name, version }) => [`pkg:npm/${name.replaceAll("@", "%40")}`, version],
  },
  {
    name: "parseMinSupportDays",
    file: ({ version }) => version,
    names: "9",
    versions: "365",
    markers: () => ["365"],
  },
  {
    name: "parsePurl",
    file: ({ name, version }) => `pkg:npm/${name}@${version}`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseVers",
    file: ({ version }) => `vers:npm/${version}`,
    names: "npm",
    versions: "9.8.7|9.8.7|9.9.0",
    markers: (values) => values.version.split("|"),
  },
  {
    name: "parseVersLenient",
    file: ({ version }) => `vers:npm/${version}`,
    names: "npm",
    versions: "9.8.7|9.8.7|9.9.0",
    markers: (values) => values.version.split("|"),
  },
  {
    name: "parseCodeowners",
    file: ({ name }) => `src/${name}/*.ts @${name}\n`,
    names: "zzmark",
    versions: "9.8.7",
    markers: ({ name }) => [`src/${name}/*.ts`, `@${name}`],
  },
  {
    name: "readJsonLines (strict)",
    file: ({ name, version }) => `{"${name}":"${version}"}\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "readJsonLines (comments)",
    file: ({ name, version }) => `// ${name}\n{"${name}":"${version}"}\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseBoundedJson",
    file: ({ name, version }) => `{"${name}":"${version}"}\n`,
    names: "zzmark",
    versions: "9.8.7",
  },
  {
    name: "parseUpgradeTarget",
    file: ({ name, version }) => `${name}@${version}`,
    names: "node",
    versions: "20",
    markers: () => ["nodejs", "20"],
  },
  {
    name: "upgrade parsePhpVersion (composer)",
    file: ({ version }) => version,
    names: "php",
    versions: "8.1.2",
    markers: () => ["8", "1", "2"],
  },
  {
    name: "upgrade matchesComposerConstraint",
    file: ({ constraint }) => constraint,
    names: "php",
    versions: "8.1.2",
    kind: "matcher",
    rejected: "9.0.0|7.4.0",
    match: (constraint, version) => matchesComposerConstraint(constraint, version),
  },
  {
    name: "upgrade parseTargetVersion (dart)",
    file: ({ version }) => version,
    names: "dart",
    versions: "3.5|3.5.1|3.5.0-beta",
    markers: ({ version }) => (version === "3.5" ? ["3.5.0"] : [version]),
  },
  {
    name: "upgrade matchesDartConstraint",
    file: ({ version }) => version,
    names: "dart",
    versions: "2.17.0",
    kind: "matcher",
    rejected: "2.16.0|1.9.0",
    match: (constraint, version) => matchesDartConstraint(version, constraint),
  },
  {
    name: "upgrade parseVendorModules",
    file: ({ name, version, constraint }) => `# ${name} ${version}\n## explicit; go ${constraint}\n`,
    names: "example.com/zzmark",
    versions: "v9.8.7",
    constraints: "1.21",
  },
  {
    name: "upgrade normalizeGoVersion",
    file: ({ version }) => version,
    names: "go",
    versions: "1.21.0|1.21",
    markers: () => ["1.21.0"],
  },
  {
    name: "upgrade parseVersion (pep440)",
    file: ({ version }) => version,
    names: "python",
    versions: "9.8.7|1.0.0rc1",
    markers: ({ version }) => (version.includes("rc") ? ["1", "0", "0"] : ["9", "8", "7"]),
  },
  {
    name: "upgrade matchesSpecifier (pep440)",
    file: ({ constraint }) => constraint,
    names: "python",
    versions: "9.8.0",
    kind: "matcher",
    rejected: "9.7.0|8.0.0",
    match: (constraint, version) => matchesPep440Specifier(constraint, version),
  },
];

for (const target of CASES) {
  test(`${target.name} round-trips a canonical value`, () => {
    checkRoundTrip(target);
  });
}

test("every string parser tolerates arbitrary text", () => {
  for (const target of CASES) if (target.kind !== "matcher") checkToleratesArbitraryText(target.name);
});
