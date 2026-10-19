import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

/** Machine-readable branch states that back https://www.php.net/supported-versions.php and eol.php. */
export const PHP_BRANCHES_URL = "https://www.php.net/releases/branches.php";
export const PHP_SUPPORTED_VERSIONS_URL = "https://www.php.net/supported-versions.php";

const SOURCES = [
  { title: "PHP release branches", url: PHP_BRANCHES_URL },
  { title: "PHP supported versions", url: PHP_SUPPORTED_VERSIONS_URL },
];

const BRANCH_NAME = /^\d+\.\d+$/;

interface BranchEntry {
  branch?: unknown;
  state?: unknown;
  initial_release?: unknown;
  active_support_end?: unknown;
  security_support_end?: unknown;
}

interface Branch {
  name: string;
  state: string;
  active?: string;
  eol: string;
}

function toDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const day = value.slice(0, 10);
  return isIsoDate(day) ? day : undefined;
}

function segments(name: string): number[] {
  return name.split(".").map(Number);
}

function compareNames(left: string, right: string): number {
  const a = segments(left);
  const b = segments(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function lowerBound(name: string): string {
  return `${name}.0`;
}

function draft(branch: Branch, next: string, replacement: string | undefined): DraftRule {
  return {
    id: `php.runtime.eol-${branch.name}`,
    ecosystem: "php",
    purl: "pkg:generic/php",
    vers: `vers:semver/>=${lowerBound(branch.name)}|<${lowerBound(next)}`,
    event: "end-of-life",
    title: `PHP ${branch.name} is end-of-life`,
    summary: branch.active
      ? `The PHP release branches list marks PHP ${branch.name} as end of life: active support ended on ${branch.active} and security support ended on ${branch.eol}.`
      : `The PHP release branches list marks PHP ${branch.name} as end of life on ${branch.eol}.`,
    severity: "high",
    ...(replacement !== undefined ? { replacement: `PHP ${replacement} or later` } : {}),
    deadline: branch.eol,
    sources: SOURCES,
  };
}

export const phpSupportedVersionsImporter: Importer = {
  id: "php-1",
  ecosystem: "php",
  description: "PHP release lines that have reached end of life, from the official release-branch states (supported-versions / eol)",
  sources: SOURCES,

  async import(context) {
    const raw = await fetchJson<unknown>(context, PHP_BRANCHES_URL, { accept: "application/json" });
    if (!Array.isArray(raw)) return { rules: [], notes: ["No usable PHP release branch data was found."] };

    const notes: string[] = [];
    const branches: Branch[] = [];
    for (const [index, value] of raw.entries()) {
      if (typeof value !== "object" || value === null) {
        notes.push(`Skipped entry ${index + 1}: not an object.`);
        continue;
      }
      const entry = value as BranchEntry;
      if (typeof entry.branch !== "string" || !BRANCH_NAME.test(entry.branch)) {
        notes.push(`Skipped entry ${index + 1}: no valid PHP release branch name.`);
        continue;
      }
      if (typeof entry.state !== "string" || entry.state.trim() === "") {
        notes.push(`Skipped PHP ${entry.branch}: no valid state.`);
        continue;
      }
      const eol = toDate(entry.security_support_end);
      if (eol === undefined) {
        notes.push(`Skipped PHP ${entry.branch}: no valid security-support end date.`);
        continue;
      }
      const active = toDate(entry.active_support_end);
      const branch: Branch = { name: entry.branch, state: entry.state.trim(), eol };
      if (active !== undefined) branch.active = active;
      branches.push(branch);
    }

    const names = [...new Set(branches.map((branch) => branch.name))].sort(compareNames);
    const today = isoDate(context.now);
    const supported = branches
      .filter((branch) => (branch.state === "stable" || branch.state === "security") && branch.eol > today)
      .map((branch) => branch.name)
      .sort(compareNames);
    const replacement = supported[0];

    const rules: DraftRule[] = [];
    for (const branch of branches) {
      if (branch.state === "future") {
        notes.push(`Skipped PHP ${branch.name}: status "future".`);
        continue;
      }
      if (branch.eol > today) {
        notes.push(`Not yet end-of-life: PHP ${branch.name} (EOL ${branch.eol}).`);
        continue;
      }
      const next = names.find((name) => compareNames(name, branch.name) > 0);
      if (!next) {
        notes.push(`Skipped PHP ${branch.name}: no later release line to bound its versions.`);
        continue;
      }
      rules.push(draft(branch, next, replacement));
    }

    if (replacement === undefined) notes.push("No supported release line was found, so drafts have no replacement.");
    return { rules, notes };
  },
};
