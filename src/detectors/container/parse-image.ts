/**
 * Pure parsing of one container image reference (`[registry/]repo[:tag][@digest]`).
 * Nothing here resolves, pulls, or evaluates anything.
 */

export interface ImageReference {
  /** Registry host, normalized: Docker Hub is `docker.io`. */
  registry: string;
  /** Repository path, normalized: Docker Hub single names gain `library/`. */
  repository: string;
  tag?: string;
  digest?: string;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const REPOSITORY_PART = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

/** True when the value contains build-argument or environment interpolation. */
export function isInterpolated(value: string): boolean {
  return value.includes("$");
}

/** Parse a literal image reference. Returns undefined for dynamic or invalid values. */
export function parseImageReference(value: string): ImageReference | undefined {
  if (value.length === 0 || value.length > 512 || isInterpolated(value)) return undefined;

  let rest = value;
  let digest: string | undefined;
  const at = rest.indexOf("@");
  if (at !== -1) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
    if (!DIGEST.test(digest)) return undefined;
  }

  const slash = rest.lastIndexOf("/");
  const colon = rest.lastIndexOf(":");
  let tag: string | undefined;
  if (colon > slash) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
    if (!TAG.test(tag)) return undefined;
  }
  if (rest.length === 0) return undefined;

  const parts = rest.split("/");
  let registry = "docker.io";
  const first = parts[0]!;
  if (parts.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost")) {
    registry = first.toLowerCase();
    parts.shift();
  }
  if (registry === "index.docker.io" || registry === "registry-1.docker.io") registry = "docker.io";
  if (parts.length === 0 || !parts.every((part) => REPOSITORY_PART.test(part))) return undefined;
  if (registry === "docker.io" && parts.length === 1) parts.unshift("library");

  return {
    registry,
    repository: parts.join("/"),
    ...(tag === undefined ? {} : { tag }),
    ...(digest === undefined ? {} : { digest }),
  };
}
