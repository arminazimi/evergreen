import { formatPurl } from "../../src/purl.js";
import { PHP_PACKAGE_CANDIDATES } from "./php-candidates.js";
import { fetchJson, ImporterError } from "./types.js";
import type { DraftRule, Importer, ImporterContext, ImporterOutput } from "./types.js";

/** Packagist's description of the Composer metadata this importer reads. */
export const PACKAGIST_API_URL = "https://packagist.org/apidoc";
/** Composer v2 metadata root. One package is `${PACKAGIST_METADATA_ROOT}/<vendor>/<name>.json`. */
export const PACKAGIST_METADATA_ROOT = "https://repo.packagist.org/p2";

/**
 * A Composer package name: `vendor/name`, lowercase, as Packagist stores it.
 * https://getcomposer.org/doc/04-schema.md#name
 */
export const COMPOSER_PACKAGE_NAME = /^[a-z0-9](?:[_.-]?[a-z0-9]+)*\/[a-z0-9](?:(?:[_.]|-{1,2})?[a-z0-9]+)*$/;

const SOURCES = [
  { title: "Packagist API", url: PACKAGIST_API_URL },
  { title: "Packagist Composer metadata", url: `${PACKAGIST_METADATA_ROOT}/` },
];

export const metadataUrl = (name: string) => `${PACKAGIST_METADATA_ROOT}/${name}.json`;
export const packagePageUrl = (name: string) => `https://packagist.org/packages/${name}`;

/** Rule id for an abandoned package, matching the curated `php.package.<vendor>.<name>.abandoned` ids. */
export function abandonedRuleId(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll("/", ".")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return `php.package.${slug}.abandoned`;
}

interface Abandoned {
  /** What the author named, when the flag is a string rather than `true`. */
  replacement?: string;
}

/**
 * The package-level `abandoned` flag copied onto versions.
 *
 * A metadata file often carries the flag on only one version and omits it on the rest. One
 * consistent value is the package signal. `false` and a missing flag both mean "not abandoned".
 * Two different values are a conflict: the importer does not guess which one is current.
 */
export function abandonmentOf(versions: readonly unknown[]): Abandoned | "none" | "conflict" | "unusable" {
  const flags: unknown[] = [];
  for (const version of versions) {
    if (typeof version !== "object" || version === null || !("abandoned" in version)) continue;
    flags.push((version as { abandoned: unknown }).abandoned);
  }
  const distinct = [...new Map(flags.map((flag) => [JSON.stringify(flag), flag])).values()];
  if (distinct.length === 0) return "none";
  if (distinct.length > 1) return "conflict";
  const flag = distinct[0];
  if (flag === false) return "none";
  if (flag === true) return {};
  if (typeof flag === "string" && flag.trim()) return { replacement: flag.trim() };
  return "unusable";
}

function versionsOf(body: unknown, name: string): unknown[] | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const packages = (body as { packages?: unknown }).packages;
  if (typeof packages !== "object" || packages === null || Array.isArray(packages)) return undefined;
  const versions = (packages as Record<string, unknown>)[name];
  return Array.isArray(versions) ? versions : undefined;
}

function purl(name: string): string {
  const slash = name.indexOf("/");
  return formatPurl({ type: "composer", namespace: name.slice(0, slash), name: name.slice(slash + 1) });
}

function summary(name: string, replacement: string | undefined): string {
  const marked = `Packagist marks ${name} as abandoned and no longer maintained`;
  if (replacement === undefined) return `${marked}.`;
  if (COMPOSER_PACKAGE_NAME.test(replacement)) return `${marked}, and the author suggests using ${replacement} instead.`;
  return `${marked}, and the author points to ${replacement}.`;
}

function draft(name: string, abandoned: Abandoned): DraftRule {
  return {
    id: abandonedRuleId(name),
    ecosystem: "php",
    purl: purl(name),
    vers: "vers:composer/*",
    event: "deprecated",
    title: `${name} is abandoned`,
    summary: summary(name, abandoned.replacement),
    severity: "high",
    ...(abandoned.replacement !== undefined ? { replacement: abandoned.replacement } : {}),
    sources: [
      { title: `${name} on Packagist`, url: packagePageUrl(name) },
      { title: `${name} Composer metadata`, url: metadataUrl(name) },
    ],
  };
}

/** Drafts abandoned-package rules for `names`. Exported so tests can cover names the candidate list does not hold. */
export async function importAbandonedPackages(context: ImporterContext, names: readonly string[]): Promise<ImporterOutput> {
  const rules: DraftRule[] = [];
  const notes: string[] = [];
  const active: string[] = [];

  for (const name of [...new Set(names)].sort()) {
    if (!COMPOSER_PACKAGE_NAME.test(name)) {
      notes.push(`Skipped ${name}: not a valid Composer package name.`);
      continue;
    }
    let body: unknown;
    try {
      body = await fetchJson<unknown>(context, metadataUrl(name), { accept: "application/json" });
    } catch (error) {
      // A removed package is worth a note. Any other failure must not look like "nothing is abandoned".
      if (error instanceof ImporterError && /HTTP 404/.test(error.message)) {
        notes.push(`Skipped ${name}: not found on Packagist.`);
        continue;
      }
      throw error;
    }
    const versions = versionsOf(body, name);
    if (versions === undefined) {
      notes.push(`Skipped ${name}: Packagist metadata has no version list.`);
      continue;
    }
    const abandoned = abandonmentOf(versions);
    if (abandoned === "none") {
      active.push(name);
      continue;
    }
    if (abandoned === "conflict") {
      notes.push(`Skipped ${name}: versions disagree about the abandoned flag.`);
      continue;
    }
    if (abandoned === "unusable") {
      notes.push(`Skipped ${name}: the abandoned flag is not true or a replacement string.`);
      continue;
    }
    rules.push(draft(name, abandoned));
  }

  if (active.length > 0) {
    notes.push(`Not abandoned on Packagist, so no rule (remove them from PHP_PACKAGE_CANDIDATES if they stay that way): ${active.join(", ")}.`);
  }
  return { rules, notes };
}

export const phpPackagistAbandonedImporter: Importer = {
  id: "php-2",
  ecosystem: "php",
  description: "Direct Composer packages Packagist marks abandoned, from the Composer metadata abandoned flag",
  sources: SOURCES,

  import(context) {
    return importAbandonedPackages(context, PHP_PACKAGE_CANDIDATES);
  },
};
