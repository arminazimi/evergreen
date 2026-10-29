// Rewrites the pinned npm tarball URL and SHA-256 in the Homebrew formula.
//
//   node bump-homebrew-formula.mjs --version 0.7.1 --sha256 <hex> --file Formula/evergreen.rb
//
// It makes no network calls: the workflow downloads the published tarball, hashes it, and passes
// both values in. Prints `changed=true|false` and `version=<version>` for $GITHUB_OUTPUT. Exits 1
// when the formula cannot be updated safely (missing pin lines, bad inputs, or a partial match).

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const URL_LINE =
  /^(\s*url\s+")https:\/\/registry\.npmjs\.org\/evergreen-deprecation\/-\/evergreen-deprecation-[^"]+(\.tgz")\s*$/m;
const SHA_LINE = /^(\s*sha256\s+")[0-9a-f]{64}(")\s*$/m;
const PINNED_VERSION =
  /url\s+"https:\/\/registry\.npmjs\.org\/evergreen-deprecation\/-\/evergreen-deprecation-([^"]+)\.tgz"/;

/** Version currently pinned in the formula, or null when the url line is missing or malformed. */
export function readPinnedVersion(source) {
  const match = PINNED_VERSION.exec(source);
  return match ? match[1] : null;
}

/**
 * Returns the formula text with the npm pin set to `version` / `sha256`.
 * Throws when inputs are invalid or the formula does not contain exactly one url and one sha256 pin.
 */
export function bumpFormula(source, { version, sha256 }) {
  if (!VERSION.test(version)) throw new Error(`Invalid version "${version}": expected a semver like 0.7.1.`);
  if (!SHA256.test(sha256)) throw new Error(`Invalid sha256 "${sha256}": expected 64 lowercase hex characters.`);
  if (!URL_LINE.test(source)) {
    throw new Error("Formula is missing the evergreen-deprecation npm url pin.");
  }
  if (!SHA_LINE.test(source)) {
    throw new Error("Formula is missing the sha256 pin.");
  }
  if ((source.match(/^(\s*url\s+")/gm) ?? []).length !== 1) {
    throw new Error("Formula must contain exactly one url line.");
  }
  if ((source.match(/^(\s*sha256\s+")/gm) ?? []).length !== 1) {
    throw new Error("Formula must contain exactly one sha256 line.");
  }

  const previous = readPinnedVersion(source);
  const next = source
    .replace(URL_LINE, `$1https://registry.npmjs.org/evergreen-deprecation/-/evergreen-deprecation-${version}$2`)
    .replace(SHA_LINE, `$1${sha256}$2`);

  if (!readPinnedVersion(next) || readPinnedVersion(next) !== version) {
    throw new Error("Failed to rewrite the formula url pin.");
  }
  if (!new RegExp(`sha256\\s+"${sha256}"`).test(next)) {
    throw new Error("Failed to rewrite the formula sha256 pin.");
  }

  return {
    content: next,
    previousVersion: previous,
    changed: next !== source,
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  try {
    const version = option(args, "--version");
    const sha256 = option(args, "--sha256");
    const file = option(args, "--file");
    if (version === undefined || sha256 === undefined || file === undefined) {
      throw new Error("Usage: bump-homebrew-formula.mjs --version <version> --sha256 <hex> --file <path>");
    }
    const source = readFileSync(file, "utf8");
    const result = bumpFormula(source, { version, sha256 });
    if (result.changed) writeFileSync(file, result.content);
    console.log(`changed=${result.changed}\nversion=${version}\nprevious=${result.previousVersion ?? ""}`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
