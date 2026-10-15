import { parse as parseYaml } from "yaml";

import { isoDate } from "./canonical.js";
import { ACTION_CANDIDATES } from "./github-actions-candidates.js";
import { ImporterError } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";

/**
 * Node.js runtimes GitHub has removed from the Actions runner, with the date it did and the post that says so.
 * This is evidence a maintainer checks by hand: add a row, with its source, when GitHub retires another runtime.
 */
export const RETIRED_RUNTIMES: Record<string, { date: string; source: { title: string; url: string } }> = {
  node12: {
    date: "2023-08-14",
    source: { title: "Removal of Node12 from the Actions runner", url: "https://github.blog/changelog/2023-07-16-github-actions-removal-of-node12-from-the-actions-runner/" },
  },
  node16: {
    date: "2024-11-12",
    source: { title: "End of life for Actions Node16", url: "https://github.blog/changelog/2024-09-25-end-of-life-for-actions-node16/" },
  },
  node20: {
    date: "2026-09-23",
    source: { title: "Node 20 is no longer available in GitHub Actions", url: "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/" },
  },
};

export const ACTION_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The highest major probed. Real actions are well below this; it only bounds a runaway search. */
const MAX_MAJOR = 30;

const rawUrl = (action: string, major: number, file: string) => `https://raw.githubusercontent.com/${action}/v${major}/${file}`;

interface MajorRuntime {
  major: number;
  /** `runs.using` from the action's metadata at that major's tag, or undefined when it names none. */
  using: string | undefined;
  file: string;
}

async function readMajor(context: ImporterContext, action: string, major: number): Promise<MajorRuntime | undefined> {
  for (const file of ["action.yml", "action.yaml"]) {
    let text: string;
    try {
      text = await context.fetchText(rawUrl(action, major, file));
    } catch (error) {
      if (/HTTP 404/.test((error as Error).message)) continue;
      throw error;
    }
    let using: unknown;
    try {
      using = (parseYaml(text) as { runs?: { using?: unknown } } | null)?.runs?.using;
    } catch {
      using = undefined;
    }
    return { major, using: typeof using === "string" ? using : undefined, file };
  }
  return undefined;
}

async function readMajors(context: ImporterContext, action: string): Promise<MajorRuntime[]> {
  const found: MajorRuntime[] = [];
  let misses = 0;
  for (let major = 1; major <= MAX_MAJOR; major++) {
    const entry = await readMajor(context, action, major);
    if (entry) {
      found.push(entry);
      misses = 0;
    } else if (++misses >= 2 && (found.length > 0 || major >= 3)) {
      break;
    }
  }
  return found;
}

const nodeVersion = (using: string | undefined) => (using && /^node\d+$/.test(using) ? Number(using.slice(4)) : undefined);

export const githubActionsRuntimeImporter: Importer = {
  id: "github-actions-runtime",
  ecosystem: "github-actions",
  description: "GitHub Actions releases that run on a Node.js runtime GitHub has retired, from each action's own metadata",
  sources: [
    { title: "Metadata syntax for GitHub Actions (runs.using)", url: "https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-javascript-actions" },
    ...Object.values(RETIRED_RUNTIMES).map((runtime) => runtime.source),
  ],

  async import(context) {
    const today = isoDate(context.now);
    const retired = (using: string | undefined) => {
      const entry = using ? RETIRED_RUNTIMES[using] : undefined;
      return entry !== undefined && entry.date <= today;
    };

    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const upToDate: string[] = [];

    for (const action of [...new Set(ACTION_CANDIDATES)].sort()) {
      if (!ACTION_NAME.test(action)) {
        notes.push(`Skipped ${action}: not an owner/repo action name.`);
        continue;
      }
      const majors = await readMajors(context, action);
      if (majors.length === 0) {
        notes.push(`Skipped ${action}: no action.yml was found at any major tag.`);
        continue;
      }
      if (!majors.some((entry) => nodeVersion(entry.using) !== undefined)) {
        notes.push(`Skipped ${action}: not a JavaScript action (runs.using is ${[...new Set(majors.map((entry) => entry.using ?? "unset"))].join(", ")}).`);
        continue;
      }

      // The supported releases are the newest run of majors that use a JavaScript runtime GitHub still provides.
      const supported = (entry: MajorRuntime) => nodeVersion(entry.using) !== undefined && !retired(entry.using);
      let first = majors.length;
      while (first > 0 && supported(majors[first - 1]!)) first--;
      if (first === majors.length) {
        notes.push(`Skipped ${action}: no release runs on a supported runtime yet (the latest, v${majors[majors.length - 1]!.major}, uses ${majors[majors.length - 1]!.using}).`);
        continue;
      }
      const firstSupported = majors[first]!;
      const olderRetired = majors.slice(0, first).filter((entry) => retired(entry.using));
      if (first === 0 || olderRetired.length === 0) {
        upToDate.push(action);
        continue;
      }

      const newest = olderRetired[olderRetired.length - 1]!;
      const runtime = RETIRED_RUNTIMES[newest.using!]!;
      const repo = action.split("/")[1]!;
      rules.push({
        id: `github-actions.${repo.toLowerCase()}.${newest.using}`,
        ecosystem: "github-actions",
        purl: `pkg:github/${action.toLowerCase()}`,
        vers: `vers:semver/<${firstSupported.major}.0.0`,
        event: "end-of-support",
        title: `Unsupported ${action} runtime`,
        summary: `This release predates the action's Node.js ${nodeVersion(firstSupported.using)} runtime. GitHub no longer provides Node.js ${nodeVersion(newest.using)} on Actions runners.`,
        severity: "high",
        replacement: `${action}@v${firstSupported.major} or later`,
        deadline: runtime.date,
        sources: [
          runtime.source,
          { title: `${action} v${firstSupported.major} ${firstSupported.file}`, url: `https://github.com/${action}/blob/v${firstSupported.major}/${firstSupported.file}` },
        ],
        "x-github-actions": { action, supportedFromMajor: firstSupported.major },
      });
    }

    if (upToDate.length > 0) notes.push(`No release uses a retired runtime, so no rule (remove them from ACTION_CANDIDATES if they stay that way): ${upToDate.join(", ")}.`);
    return { rules, notes };
  },
};

export { ImporterError };
