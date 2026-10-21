import { formatPurl } from "../../src/purl.js";
import { fetchJson, ImporterError } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const PUB_API = "https://pub.dev/api/packages";
export const PUB_REPOSITORY_SPEC = "https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md";
export const PUB_ACCEPT = "application/vnd.pub.v2+json";

/** Direct packages selected for lifecycle review. Keep this small, sorted, and evidence-driven. */
export const DART_PACKAGE_CANDIDATES = ["analysis_server_client"] as const;

/** Pub package names start with a lowercase letter and contain lowercase letters, digits, or underscores. */
export const PUB_PACKAGE_NAME = /^[a-z][a-z0-9_]*$/;

export const packageUrl = (name: string) => `${PUB_API}/${name}`;

interface PackageDetail {
  name?: unknown;
  isDiscontinued?: unknown;
  replacedBy?: unknown;
}

function ruleSlug(name: string): string {
  return name.replaceAll("_", "-");
}

export const dartDiscontinuedImporter: Importer = {
  id: "dart-1",
  ecosystem: "dart",
  description: "Direct pub.dev packages marked discontinued by their publishers",
  sources: [
    { title: "Hosted Pub Repository Specification Version 2", url: PUB_REPOSITORY_SPEC },
    { title: "pub.dev package API", url: PUB_API },
  ],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const active: string[] = [];

    for (const name of [...new Set(DART_PACKAGE_CANDIDATES)].sort()) {
      if (!PUB_PACKAGE_NAME.test(name)) {
        notes.push(`Skipped ${name}: not a valid pub package name.`);
        continue;
      }

      const url = packageUrl(name);
      let detail: PackageDetail;
      try {
        detail = await fetchJson<PackageDetail>(context, url, { accept: PUB_ACCEPT });
      } catch (error) {
        if (/HTTP 404/.test((error as Error).message)) {
          notes.push(`Skipped ${name}: not found on pub.dev.`);
          continue;
        }
        throw error;
      }

      if (detail.name !== name) {
        throw new ImporterError(`GET ${url} returned package name ${JSON.stringify(detail.name)}, expected ${JSON.stringify(name)}.`);
      }
      if (detail.isDiscontinued !== true) {
        active.push(name);
        continue;
      }

      const replacement = typeof detail.replacedBy === "string" && PUB_PACKAGE_NAME.test(detail.replacedBy) && detail.replacedBy !== name
        ? detail.replacedBy
        : undefined;
      if (detail.replacedBy !== undefined && replacement === undefined) {
        notes.push(`Ignored invalid replacement for ${name}: ${JSON.stringify(detail.replacedBy)}.`);
      }

      rules.push({
        id: `dart.package.${ruleSlug(name)}.discontinued`,
        ecosystem: "dart",
        purl: formatPurl({ type: "pub", name }),
        vers: "vers:semver/*",
        event: "deprecated",
        title: `${name} is discontinued on pub.dev`,
        summary: `pub.dev marks ${name} as discontinued.${replacement ? ` Its publisher recommends ${replacement} instead.` : ""}`,
        severity: "medium",
        ...(replacement ? { replacement } : {}),
        sources: [
          { title: `${name} on pub.dev`, url: `https://pub.dev/packages/${name}` },
          { title: `${name} package metadata`, url },
          { title: "Hosted Pub Repository Specification Version 2", url: PUB_REPOSITORY_SPEC },
        ],
        "x-dart": { kind: "package", package: name },
      });
    }

    if (active.length > 0) notes.push(`Not discontinued on pub.dev: ${active.join(", ")}.`);
    return { rules, notes };
  },
};
