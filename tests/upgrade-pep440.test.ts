import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesSpecifier } from "../src/upgrade/pep440.js";

/**
 * Every clause shape `parseClause` reads: the PEP 440 operators, the `.*` prefix form, Poetry's `^` and `~`,
 * the compatible-release `~=`, comma-joined AND sets, `||` alternatives, and the forms it must refuse.
 */
const clauseCases: ReadonlyArray<readonly [string, string, boolean | undefined]> = [
  // A bare version and each comparison operator.
  ["1.4", "1.4", true],
  ["1.4", "1.4.1", false],
  ["==1.4", "1.4", true],
  ["===1.4", "1.4", true],
  ["!=1.4", "1.4", false],
  ["!=1.4", "1.5", true],
  [">1.4", "1.4", false],
  [">1.4", "1.4.1", true],
  [">=1.4", "1.4", true],
  ["<1.4", "1.3", true],
  ["<=1.4", "1.4", true],
  // An operator that names no version, and text that is not a version at all.
  [">=", "1.4", undefined],
  ["banana", "1.4", undefined],
  ["", "1.4", undefined],
  // `*` matches everything only bare or after `==`; with any other operator it is not a clause.
  ["*", "1.4", true],
  ["==*", "1.4", true],
  ["!=*", "1.4", undefined],
  [">=*", "1.4", undefined],
  // The `.*` prefix form, with and without `==`/`!=`.
  ["1.4.*", "1.4.7", true],
  ["==1.4.*", "1.4.7", true],
  ["==1.4.*", "1.5.0", false],
  ["!=1.4.*", "1.4.7", false],
  // A prefix with a pre-release, post, dev or local part is not a prefix this matcher reads.
  ["==1.4a1.*", "1.4", undefined],
  ["==1.4.post1.*", "1.4", undefined],
  ["==1.4.dev1.*", "1.4", undefined],
  ["==1.4+abc.*", "1.4", undefined],
  // Poetry's caret: the first non-zero segment bounds the upgrade, and an all-zero release bumps the last.
  ["^1.4", "1.9.9", true],
  ["^1.4", "2.0", false],
  ["^0.4", "0.4.9", true],
  ["^0.4", "0.5", false],
  ["^0", "0.9.9", true],
  ["^0", "1.0", false],
  ["^banana", "1.4", undefined],
  // Poetry's tilde: patch updates for three segments, minor updates for two.
  ["~1.4.2", "1.4.9", true],
  ["~1.4.2", "1.5", false],
  ["~1.4", "1.4.9", true],
  ["~1.4", "1.5", false],
  ["~banana", "1.4", undefined],
  // PEP 440's compatible release drops the last segment to bound the upgrade, and needs a minor to anchor on.
  ["~=1.4", "1.4.9", true],
  ["~=1.4", "1.5", true],
  ["~=1.4", "2.0", false],
  ["~=1.4.2", "1.4.9", true],
  ["~=1.4.2", "1.5", false],
  ["~=1", "1.4", undefined],
  ["~=banana", "1.4", undefined],
  // A comma joins an AND set, and whitespace between comparators does too.
  [">=1.4,<2.0", "1.9", true],
  [">=1.4,<2.0", "2.0", false],
  [">= 1.4 < 2.0", "1.9", true],
  [">=1.4,", "1.9", undefined],
  // `||` joins alternatives; one alternative this cannot read makes the whole specifier unknown.
  ["1.4 || >=2.0", "2.1", true],
  ["1.4 || banana", "2.1", undefined],
  ["1.4 ||", "1.4", undefined],
  // Epochs and local labels, as PEP 440 states them.
  [">=1!1.4", "1!1.5", true],
  [">=1!1.4", "2.0", false],
  ["==1.4+abc", "1.4+abc", true],
  ["==1.4", "1.4+abc", true],
];

test("every clause shape matches, rejects, or reports that it cannot be read", () => {
  for (const [specifier, version, expected] of clauseCases) {
    assert.equal(matchesSpecifier(specifier, version), expected, `${specifier} against ${version}`);
  }
});
