import { formatPurl } from "../../src/purl.js";
import { NPM_CANDIDATES } from "./npm-candidates.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

const REGISTRY = "https://registry.npmjs.org";

/** A package name as npm allows it: optionally scoped, letters, digits, and `. _ ~ -`. */
export const NPM_NAME = /^(?:@[A-Za-z0-9~-][A-Za-z0-9._~-]*\/)?[A-Za-z0-9~-][A-Za-z0-9._~-]*$/;

const MAX_MESSAGE = 280;

export const registryUrl = (name: string) => `${REGISTRY}/${name.replace("/", "%2f")}/latest`;

/** The part of a rule id that names the package: `request`, or `scope.name` for a scoped package. */
export function ruleSlug(name: string): string {
  return name
    .replace(/^@/, "")
    .replace("/", ".")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .replace(/[-.]{2,}/g, "-");
}

function purlFor(name: string): string {
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    return formatPurl({ type: "npm", namespace: name.slice(0, slash), name: name.slice(slash + 1) });
  }
  return formatPurl({ type: "npm", name });
}

function quote(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1).trimEnd()}…` : text;
}

interface LatestManifest {
  name?: string;
  version?: string;
  deprecated?: unknown;
}

export const npmDeprecatedImporter: Importer = {
  id: "npm-deprecated",
  ecosystem: "npm",
  description: "npm packages whose latest version carries a maintainer deprecation notice",
  sources: [
    { title: "npm registry package metadata", url: `${REGISTRY}/` },
    { title: "npm deprecate", url: "https://docs.npmjs.com/cli/commands/npm-deprecate" },
  ],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const notDeprecated: string[] = [];

    for (const name of [...new Set(NPM_CANDIDATES)].sort()) {
      if (!NPM_NAME.test(name)) {
        notes.push(`Skipped ${name}: not a valid npm package name.`);
        continue;
      }
      let latest: LatestManifest;
      try {
        latest = await fetchJson<LatestManifest>(context, registryUrl(name));
      } catch (error) {
        // A package that was removed from npm is worth a note; any other failure must not look like "nothing deprecated".
        if (/HTTP 404/.test((error as Error).message)) {
          notes.push(`Skipped ${name}: not found on npm.`);
          continue;
        }
        throw error;
      }
      const message = typeof latest.deprecated === "string" ? latest.deprecated.trim() : "";
      if (!message) {
        notDeprecated.push(name);
        continue;
      }
      rules.push({
        id: `npm.package.${ruleSlug(name)}.deprecated`,
        ecosystem: "npm",
        purl: purlFor(name),
        vers: "vers:npm/*",
        event: "deprecated",
        title: `${name} is deprecated`,
        summary: `npm marks ${name} as deprecated: "${quote(message)}"`,
        severity: "medium",
        sources: [
          { title: `${name} on npm`, url: `https://www.npmjs.com/package/${name}` },
          { title: `${name} registry metadata`, url: registryUrl(name) },
        ],
        "x-npm": { package: name },
      });
    }

    if (notDeprecated.length > 0) {
      notes.push(`Not deprecated at their latest version, so no rule (remove them from NPM_CANDIDATES if they stay that way): ${notDeprecated.join(", ")}.`);
    }
    return { rules, notes };
  },
};
