import { required } from "../../required.js";

export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: { node?: string };
  volta?: { node?: string };
}

/**
 * The sections that state the version a project runs. When one package appears in several of them, the later
 * section wins. peerDependencies is deliberately absent: a peer range states which versions a library is
 * compatible with, not the version installed, so a package declared only as a peer is never reported.
 */
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"] as const;

export function parsePackageManifest(contents: string): PackageManifest {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new SyntaxError("package.json must contain a JSON object");
  return parsed as PackageManifest;
}

export function declaredDependencies(manifest: PackageManifest): Map<string, { range: string; section: string }> {
  const declared = new Map<string, { range: string; section: string }>();
  for (const section of dependencySections) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      declared.set(name, { range, section });
    }
  }
  return declared;
}

export function propertyLine(contents: string, property: string): number {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[\\t ]*["']${escaped}["']\\s*:`, "m");
  const match = pattern.exec(contents);
  return match ? contents.slice(0, match.index).split(/\r?\n/).length : 1;
}

/**
 * The line of `name` declared directly inside the top-level `section` object of a package.json. Keys are matched
 * by nesting depth, so the same name in another section, or nested deeper (such as an overrides block), is never
 * taken. The last occurrence wins, as it does for JSON.parse. Falls back to line 1 when the key is not found.
 */
export function declarationLine(contents: string, section: string, name: string): number {
  const token = /("(?:[^"\\]|\\.)*")(\s*:)?|[{}[\]]/g;
  let depth = 0;
  let topKey = "";
  let found = -1;
  for (let match = token.exec(contents); match; match = token.exec(contents)) {
    const text = match[0];
    if (text === "{" || text === "[") depth++;
    else if (text === "}" || text === "]") depth--;
    else if (match[2] !== undefined) {
      const key = JSON.parse(required(match[1], "package.json key")) as string;
      if (depth === 1) topKey = key;
      else if (depth === 2 && topKey === section && key === name) found = match.index;
    }
  }
  return found >= 0 ? contents.slice(0, found).split(/\r?\n/).length : 1;
}
