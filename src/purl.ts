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

/** PURL types Evergreen normalizes. Other types are accepted and kept as written. */
export const supportedPurlTypes = [
  "npm",
  "pypi",
  "golang",
  "cargo",
  "maven",
  "nuget",
  "gem",
  "composer",
  "pub",
  "swift",
  "docker",
  "github",
  "generic",
] as const;

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
    ...(purl.qualifiers && Object.keys(purl.qualifiers).length > 0
      ? { qualifiers: purl.qualifiers }
      : {}),
    ...(purl.subpath ? { subpath: purl.subpath } : {}),
  };
}

export function parsePurl(value: string): PackageUrl {
  let rest = value.trim();
  if (!rest.startsWith("pkg:")) throw new PurlError(`PURL must start with "pkg:": ${value}`);
  rest = rest.slice(4).replace(/^\/+/, "");

  let subpath: string | undefined;
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    subpath = rest
      .slice(hash + 1)
      .split("/")
      .filter((segment) => segment && segment !== "." && segment !== "..")
      .map(decode)
      .join("/");
    rest = rest.slice(0, hash);
  }

  let qualifiers: Record<string, string> | undefined;
  const question = rest.indexOf("?");
  if (question >= 0) {
    qualifiers = {};
    for (const pair of rest.slice(question + 1).split("&")) {
      if (!pair) continue;
      const equals = pair.indexOf("=");
      if (equals <= 0) throw new PurlError(`Invalid qualifier "${pair}" in ${value}`);
      const key = pair.slice(0, equals).toLowerCase();
      const qualifierValue = decode(pair.slice(equals + 1));
      if (qualifierValue) qualifiers[key] = qualifierValue;
    }
    rest = rest.slice(0, question);
  }

  const slash = rest.indexOf("/");
  if (slash <= 0) throw new PurlError(`PURL is missing a type or name: ${value}`);
  const type = rest.slice(0, slash).toLowerCase();
  if (!TYPE_PATTERN.test(type)) throw new PurlError(`Invalid PURL type "${type}".`);
  rest = rest.slice(slash + 1).replace(/\/+$/, "");

  let version: string | undefined;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    version = decode(rest.slice(at + 1));
    rest = rest.slice(0, at);
  }

  const segments = rest.split("/").filter(Boolean).map(decode);
  const name = segments.pop();
  if (!name) throw new PurlError(`PURL is missing a name: ${value}`);
  const namespace = segments.length > 0 ? segments.join("/") : undefined;

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
