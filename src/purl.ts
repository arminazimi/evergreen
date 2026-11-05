/**
 * Package URL (PURL) parsing and canonical formatting.
 * https://github.com/package-url/purl-spec
 */

export interface PackageUrl {
  type: string;
  namespace?: string;
  name: string;
  version?: string;
  qualifiers?: Record<string, string>;
  subpath?: string;
}

export class PurlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurlError";
  }
}

const TYPE_PATTERN = /^[a-z][a-z0-9.+-]*$/;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new PurlError(`Invalid percent-encoding in "${segment}".`);
  }
}

function encode(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}

/**
 * Drops trailing `/` characters from a PURL path. A PURL comes from repository files and lockfiles,
 * so it is untrusted: the loop stays linear where `/\/+$/` backtracks quadratically on a long run of
 * slashes (`js/polynomial-redos`).
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

function normalize(purl: PackageUrl): PackageUrl {
  const type = purl.type.toLowerCase();
  let namespace = purl.namespace;
  let name = purl.name;

  switch (type) {
    case "npm":
    case "golang":
    case "composer":
    case "github":
      namespace = namespace?.toLowerCase();
      name = name.toLowerCase();
      break;
    case "pypi":
      name = name.toLowerCase().replace(/_/g, "-");
      break;
    case "pub":
      name = name.toLowerCase();
      break;
    case "docker":
      namespace = namespace?.toLowerCase();
      name = name.toLowerCase();
      break;
    default:
      break;
  }

  return {
    type,
    ...(namespace ? { namespace } : {}),
    name,
    ...(purl.version !== undefined ? { version: purl.version } : {}),
    ...(purl.qualifiers && Object.keys(purl.qualifiers).length > 0 ? { qualifiers: purl.qualifiers } : {}),
    ...(purl.subpath ? { subpath: purl.subpath } : {}),
  };
}

/** Splits the `#subpath` fragment off a PURL, keeping only safe path segments. */
function takeSubpath(rest: string): { rest: string; subpath?: string } {
  const hash = rest.indexOf("#");
  if (hash < 0) return { rest };
  const subpath = rest
    .slice(hash + 1)
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map(decode)
    .join("/");
  return { rest: rest.slice(0, hash), subpath };
}

function parseQualifiers(query: string, value: string): Record<string, string> {
  const qualifiers: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const equals = pair.indexOf("=");
    if (equals <= 0) throw new PurlError(`Invalid qualifier "${pair}" in ${value}`);
    const qualifierValue = decode(pair.slice(equals + 1));
    if (qualifierValue) qualifiers[pair.slice(0, equals).toLowerCase()] = qualifierValue;
  }
  return qualifiers;
}

/** Splits the `?qualifiers` query off a PURL. */
function takeQualifiers(rest: string, value: string): { rest: string; qualifiers?: Record<string, string> } {
  const question = rest.indexOf("?");
  if (question < 0) return { rest };
  return {
    rest: rest.slice(0, question),
    qualifiers: parseQualifiers(rest.slice(question + 1), value),
  };
}

/** Reads the lowercased type before the first `/`, then the path after it. */
function splitTypeAndPath(rest: string, value: string): { type: string; rest: string } {
  const slash = rest.indexOf("/");
  if (slash <= 0) throw new PurlError(`PURL is missing a type or name: ${value}`);
  const type = rest.slice(0, slash).toLowerCase();
  if (!TYPE_PATTERN.test(type)) throw new PurlError(`Invalid PURL type "${type}".`);
  return { type, rest: trimTrailingSlashes(rest.slice(slash + 1)) };
}

/** Splits the `@version` suffix off a PURL path. */
function takeVersion(rest: string): { rest: string; version?: string } {
  const at = rest.lastIndexOf("@");
  if (at < 0) return { rest };
  return { rest: rest.slice(0, at), version: decode(rest.slice(at + 1)) };
}

/** The last path segment is the name; the segments before it are the namespace. */
function splitName(rest: string, value: string): { name: string; namespace: string | undefined } {
  const segments = rest.split("/").filter(Boolean).map(decode);
  const name = segments.pop();
  if (!name) throw new PurlError(`PURL is missing a name: ${value}`);
  return {
    name,
    namespace: segments.length > 0 ? segments.join("/") : undefined,
  };
}

export function parsePurl(value: string): PackageUrl {
  if (!value.trim().startsWith("pkg:")) throw new PurlError(`PURL must start with "pkg:": ${value}`);
  const body = value.trim().slice(4).replace(/^\/+/, "");
  const { rest: withoutSubpath, subpath } = takeSubpath(body);
  const { rest: withoutQuery, qualifiers } = takeQualifiers(withoutSubpath, value);
  const { type, rest: path } = splitTypeAndPath(withoutQuery, value);
  const { rest: withoutVersion, version } = takeVersion(path);
  const { name, namespace } = splitName(withoutVersion, value);

  return normalize({
    type,
    ...(namespace ? { namespace } : {}),
    name,
    ...(version ? { version } : {}),
    ...(qualifiers ? { qualifiers } : {}),
    ...(subpath ? { subpath } : {}),
  });
}

export function formatPurl(purl: PackageUrl): string {
  const canonical = normalize(purl);
  if (!TYPE_PATTERN.test(canonical.type)) throw new PurlError(`Invalid PURL type "${canonical.type}".`);
  if (!canonical.name) throw new PurlError("PURL name is required.");

  let result = `pkg:${canonical.type}/`;
  if (canonical.namespace) {
    result += `${canonical.namespace.split("/").filter(Boolean).map(encode).join("/")}/`;
  }
  result += encode(canonical.name);
  if (canonical.version) result += `@${encode(canonical.version)}`;
  if (canonical.qualifiers) {
    const pairs = Object.entries(canonical.qualifiers)
      .filter(([, qualifierValue]) => qualifierValue)
      .map(([key, qualifierValue]) => [key.toLowerCase(), qualifierValue] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, qualifierValue]) => `${key}=${encode(qualifierValue)}`);
    if (pairs.length > 0) result += `?${pairs.join("&")}`;
  }
  if (canonical.subpath) result += `#${canonical.subpath.split("/").map(encode).join("/")}`;
  return result;
}

/** Returns the canonical form of a PURL string. */
export function normalizePurl(value: string): string {
  return formatPurl(parsePurl(value));
}

/** Returns the PURL without version, qualifiers, or subpath: the identity registry rules use. */
export function purlIdentity(value: string | PackageUrl): string {
  const parsed = typeof value === "string" ? parsePurl(value) : value;
  return formatPurl({
    type: parsed.type,
    ...(parsed.namespace ? { namespace: parsed.namespace } : {}),
    name: parsed.name,
  });
}
