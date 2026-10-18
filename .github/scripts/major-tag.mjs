// Decides whether, and where, the major tag of the GitHub Action moves after a release (v1 -> v1.4.2).
//
//   node major-tag.mjs select --tags "<one tag per line>" --package-version 1.4.2
//   node major-tag.mjs direction --major v1 --release v1.4.2 --current-tags "<tags at the major tag's commit>"
//
// It makes no git calls and no network calls: the workflow gives it the tags, and it prints `key=value` lines
// that the workflow appends to $GITHUB_OUTPUT. It exits 1 with a message when the release must not move a tag.
// Only stable releases from 1.0.0 on move a major tag; pre-releases and 0.x releases leave every tag alone.

import { pathToFileURL } from "node:url";

const STABLE = /^v([1-9][0-9]*)\.([0-9]+)\.([0-9]+)$/;

/** `v1.4.2` as { major, minor, patch }, or null for anything that is not a stable post-1.0 release tag. */
export function parseStableTag(tag) {
  const match = STABLE.exec(tag);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

/** Negative, zero, or positive, like a numeric sort: compares two stable tags by major, minor, then patch. */
export function compareStableTags(left, right) {
  const a = parseStableTag(left);
  const b = parseStableTag(right);
  if (!a || !b) throw new Error(`Cannot compare "${left}" and "${right}": both must be stable release tags like v1.2.3.`);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const lines = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter((line) => line !== "");

/**
 * Which release tag at a commit moves a major tag. Returns { move: false, reason } when none does, and
 * { move: true, releaseTag, majorTag } otherwise. Throws when two stable tags point at the commit or when the tag
 * does not match package.json, because then the right answer is not clear.
 */
export function selectRelease(tagsAtCommit, packageVersion) {
  const stable = lines(tagsAtCommit).filter((tag) => parseStableTag(tag) !== null);
  if (stable.length === 0) return { move: false, reason: "No stable post-1.0 release tag points at this commit; leaving major tags unchanged." };
  if (stable.length > 1) throw new Error(`More than one stable release tag points at this commit: ${stable.join(", ")}.`);
  const releaseTag = stable[0];
  if (releaseTag !== `v${packageVersion}`) throw new Error(`Release tag ${releaseTag} does not match package.json version v${packageVersion}.`);
  return { move: true, releaseTag, majorTag: `v${parseStableTag(releaseTag).major}` };
}

/**
 * A major tag only moves forward. `currentTags` are the tags at the commit the major tag points at now (empty when
 * the major tag does not exist yet). Throws when one of them is a newer release of the same major than `releaseTag`.
 */
export function checkDirection(majorTag, releaseTag, currentTags) {
  const major = parseStableTag(releaseTag)?.major;
  if (major === undefined || majorTag !== `v${major}`) throw new Error(`${majorTag} is not the major tag of ${releaseTag}.`);
  const sameMajor = lines(currentTags).filter((tag) => parseStableTag(tag)?.major === major);
  const newest = sameMajor.sort(compareStableTags).at(-1);
  if (newest !== undefined && compareStableTags(newest, releaseTag) > 0) {
    throw new Error(`Refusing to move ${majorTag} backward from ${newest} to ${releaseTag}.`);
  }
  return { newest: newest ?? "" };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  const [command] = args;
  try {
    if (command === "select") {
      const version = option(args, "--package-version");
      if (version === undefined) throw new Error("Usage: major-tag.mjs select --tags <tags> --package-version <version>");
      const result = selectRelease(option(args, "--tags") ?? "", version);
      if (!result.move) {
        console.error(result.reason);
        console.log("move=false");
      } else {
        console.log(`move=true\nrelease-tag=${result.releaseTag}\nmajor-tag=${result.majorTag}`);
      }
      return 0;
    }
    if (command === "direction") {
      const major = option(args, "--major");
      const release = option(args, "--release");
      if (major === undefined || release === undefined) throw new Error("Usage: major-tag.mjs direction --major <tag> --release <tag> --current-tags <tags>");
      const { newest } = checkDirection(major, release, option(args, "--current-tags") ?? "");
      console.log(`current-release=${newest}`);
      return 0;
    }
    throw new Error("Usage: major-tag.mjs <select|direction> ...");
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
