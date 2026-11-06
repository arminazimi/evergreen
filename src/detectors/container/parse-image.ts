/**
 * Pure parsing of one container image reference (`[registry/]repo[:tag][@digest]`).
 * Nothing here resolves, pulls, or evaluates anything.
 */

import { required } from "../../required.js";

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

/** Split a trailing `@sha256:...` digest off; undefined when the digest is malformed. */
function splitDigest(value: string): { rest: string; digest?: string } | undefined {
  const at = value.indexOf("@");
  if (at === -1) return { rest: value };
  const digest = value.slice(at + 1);
  if (!DIGEST.test(digest)) return undefined;
  return { rest: value.slice(0, at), digest };
}

/** Split a trailing `:tag` (one after the last `/`) off; undefined when the tag is malformed. */
function splitTag(value: string): { rest: string; tag?: string } | undefined {
  const colon = value.lastIndexOf(":");
  if (colon <= value.lastIndexOf("/")) return { rest: value };
  const tag = value.slice(colon + 1);
  if (!TAG.test(tag)) return undefined;
  return { rest: value.slice(0, colon), tag };
}

/** The registry host and repository path parts of a reference with its tag and digest removed. */
function splitRepository(reference: string): { registry: string; parts: string[] } | undefined {
  const parts = reference.split("/");
  let registry = "docker.io";
  const first = required(parts[0], "repository part");
  if (parts.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost")) {
    registry = first.toLowerCase();
    parts.shift();
  }
  if (registry === "index.docker.io" || registry === "registry-1.docker.io") registry = "docker.io";
  if (parts.length === 0 || !parts.every((part) => REPOSITORY_PART.test(part))) return undefined;
  if (registry === "docker.io" && parts.length === 1) parts.unshift("library");
  return { registry, parts };
}

/** Parse a literal image reference. Returns undefined for dynamic or invalid values. */
export function parseImageReference(value: string): ImageReference | undefined {
  if (value.length === 0 || value.length > 512 || isInterpolated(value)) return undefined;

  const withoutDigest = splitDigest(value);
  if (!withoutDigest) return undefined;
  const withoutTag = splitTag(withoutDigest.rest);
  if (!withoutTag || withoutTag.rest.length === 0) return undefined;
  const repository = splitRepository(withoutTag.rest);
  if (!repository) return undefined;

  const { tag } = withoutTag;
  const { digest } = withoutDigest;
  return {
    registry: repository.registry,
    repository: repository.parts.join("/"),
    ...(tag === undefined ? {} : { tag }),
    ...(digest === undefined ? {} : { digest }),
  };
}
