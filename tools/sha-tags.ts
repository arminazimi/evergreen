// Picks the tag that stands for a commit when several release tags point at it.

const EXACT_VERSION = /^v(\d+)\.(\d+)\.(\d+)$/;

function parts(tag: string): [number, number, number] {
  const match = EXACT_VERSION.exec(tag);
  if (!match) throw new Error(`Not an exact release tag: ${tag}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Two release tags can point at the same commit (for example `v1.0.1` and `v1.0.2` when a release was
 * re-tagged). That is harmless for classification as long as both are in the same major version, because
 * Evergreen only needs the major; the higher tag is kept so the result does not depend on listing order.
 * Tags in different majors for one commit are ambiguous and an error.
 */
export function chooseTag(action: string, sha: string, existing: string, candidate: string): string {
  const [existingMajor, existingMinor, existingPatch] = parts(existing);
  const [candidateMajor, candidateMinor, candidatePatch] = parts(candidate);
  if (existingMajor !== candidateMajor) {
    throw new Error(`${action}@${sha} has conflicting tags ${existing} and ${candidate}`);
  }
  const candidateIsHigher =
    candidateMinor !== existingMinor ? candidateMinor > existingMinor : candidatePatch > existingPatch;
  return candidateIsHigher ? candidate : existing;
}
