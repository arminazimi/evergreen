import { formatPurl } from "../../src/purl.js";
import { PHP_PACKAGE_CANDIDATES } from "./php-candidates.js";
import { fetchJson, ImporterError } from "./types.js";
import type { DraftRule, Importer, ImporterContext, ImporterOutput } from "./types.js";

/** Packagist's description of the Composer metadata this importer reads. */
export const PACKAGIST_API_URL = "https://packagist.org/apidoc";
/** Composer v2 metadata root. One package is `${PACKAGIST_METADATA_ROOT}/<vendor>/<name>.json`. */
export const PACKAGIST_METADATA_ROOT = "https://repo.packagist.org/p2";

const isLowerAlphaNumeric = (code: number): boolean => (code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a);

/**
 * One side of a package name: lowercase alphanumeric runs joined by a single `.`, `_`, or `-`, and, in
 * the package part, also by a doubled `--`. Leading, trailing, and doubled separators do not count.
 */
function isComposerSegment(segment: string, allowDoubleHyphen: boolean): boolean {
  let index = 0;
  // Nothing but a separator has been seen yet, so the segment must start with an alphanumeric.
  let afterSeparator = true;
  while (index < segment.length) {
    const code = segment.charCodeAt(index);
    if (isLowerAlphaNumeric(code)) {
      afterSeparator = false;
      index += 1;
      continue;
    }
    if (afterSeparator) return false;
    if (code === 0x2d && allowDoubleHyphen && segment.charCodeAt(index + 1) === 0x2d) index += 2;
    else if (code === 0x2d || code === 0x2e || code === 0x5f) index += 1;
    else return false;
    afterSeparator = true;
  }
  return !afterSeparator;
}

/**
 * Whether `value` is a Composer package name: `vendor/name`, lowercase, as Packagist stores it.
 * https://getcomposer.org/doc/04-schema.md#name
 *
 * A manual scan keeps this linear. The equivalent expression
 * `^[a-z0-9](?:[_.-]?[a-z0-9]+)*\/[a-z0-9](?:(?:[_.]|-{1,2})?[a-z0-9]+)*$` backtracks exponentially
 * on input such as `"a".repeat(31) + "!"`, and Packagist metadata supplies both the name and the
 * abandonment replacement that are checked here (`js/redos`).
 */
export function isComposerPackageName(value: string): boolean {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash !== value.lastIndexOf("/")) return false;
  return isComposerSegment(value.slice(0, slash), false) && isComposerSegment(value.slice(slash + 1), true);
}

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
  if (isComposerPackageName(replacement)) return `${marked}, and the author suggests using ${replacement} instead.`;
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
export async function importAbandonedPackages(
  context: ImporterContext,
  names: readonly string[],
): Promise<ImporterOutput> {
  const rules: DraftRule[] = [];
  const notes: string[] = [];
  const active: string[] = [];

  for (const name of [...new Set(names)].sort()) {
    if (!isComposerPackageName(name)) {
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
    notes.push(
      `Not abandoned on Packagist, so no rule (remove them from PHP_PACKAGE_CANDIDATES if they stay that way): ${active.join(", ")}.`,
    );
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
