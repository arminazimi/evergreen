import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const NODEJS_SCHEDULE_URL = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";

const SOURCE = {
  title: "Node.js Release Working Group schedule",
  url: "https://github.com/nodejs/Release/blob/main/schedule.json",
};

/**
 * Release lines older than this are covered by the hand-written catch-all rule `nodejs.runtime.legacy`
 * (`maximumMajor`), so drafting one rule per ancient line would only add noise. Raise this together
 * with that rule's `maximumMajor`.
 */
export const FIRST_DRAFTED_MAJOR = 18;

interface ScheduleEntry {
  start?: string;
  lts?: string;
  maintenance?: string;
  end?: string;
  codename?: string;
}

const isDate = (value: unknown): value is string => isIsoDate(value);

function migration(replacementMajor: number): NonNullable<DraftRule["migration"]> {
  return {
    constraints: [
      "Keep package metadata, local version files, CI matrices, and deployment runtimes on a mutually compatible Node.js release.",
      "Confirm native modules and production dependencies support the target Node.js major.",
    ],
    steps: [
      {
        id: "update-runtime-declaration",
        title: "Update the Node.js declaration",
        instructions: `Raise the reported engines or pinned runtime declaration to Node.js ${replacementMajor} LTS or later.`,
        targets: "declaration",
      },
      {
        id: "align-runtime-surfaces",
        title: "Align runtime surfaces",
        instructions: "Update matching local version files, CI matrices, container images, and deployment configuration.",
        targets: "all",
      },
    ],
    verification: [
      { command: "node --version", purpose: "Confirm the active Node.js runtime is supported." },
      { command: "npm run test --if-present", purpose: "Run the repository test suite on the target runtime when defined." },
      { command: "npm run build --if-present", purpose: "Verify the project builds on the target runtime." },
    ],
  };
}

export const nodejsScheduleImporter: Importer = {
  id: "nodejs-schedule",
  ecosystem: "nodejs",
  description: "Node.js release lines that have reached end of life, from the Release Working Group schedule",
  sources: [SOURCE],

  async import(context) {
    const schedule = await fetchJson<Record<string, ScheduleEntry>>(context, NODEJS_SCHEDULE_URL);
    const today = isoDate(context.now);
    const notes: string[] = [];

    // "v20" is a release line; "v0.8" is an old 0.x line. Anything else is not something we understand.
    const lines = Object.entries(schedule)
      .map(([name, entry]) => {
        const match = /^v(\d+)(?:\.(\d+))?$/.exec(name);
        return { name, entry, major: match ? Number(match[1]) : undefined, minor: match?.[2] === undefined ? undefined : Number(match[2]) };
      })
      .sort((left, right) =>
        left.major === undefined || right.major === undefined
          ? Number(left.major === undefined) - Number(right.major === undefined) || left.name.localeCompare(right.name)
          : left.major - right.major || (left.minor ?? 0) - (right.minor ?? 0));

    // The oldest line that is still supported and has long-term support is the safest upgrade target.
    const supportedLts = lines.find(({ major, minor, entry }) => major !== undefined && minor === undefined && isDate(entry?.lts) && entry.lts <= today && isDate(entry.end) && entry.end > today);
    const replacementMajor = supportedLts?.major;
    if (replacementMajor === undefined) notes.push("No supported long-term-support line was found, so drafts have no replacement or migration steps.");

    const older: string[] = [];
    const notYet: string[] = [];
    const rules: DraftRule[] = [];
    for (const { name, major, minor, entry } of lines) {
      if (major === undefined || (major >= FIRST_DRAFTED_MAJOR && minor !== undefined)) {
        notes.push(`Skipped ${name}: not a release line name this importer understands.`);
        continue;
      }
      if (major < FIRST_DRAFTED_MAJOR) {
        older.push(name);
        continue;
      }
      if (typeof entry !== "object" || entry === null || !isDate(entry.end)) {
        notes.push(`Skipped ${name}: the schedule has no valid end date for it.`);
        continue;
      }
      if (entry.end > today) {
        notYet.push(`${name} (ends ${entry.end})`);
        continue;
      }
      const number = major;
      rules.push({
        id: `nodejs.runtime.eol-${number}`,
        ecosystem: "nodejs",
        purl: "pkg:generic/nodejs",
        vers: `vers:semver/>=${number}.0.0|<${number + 1}.0.0`,
        event: "end-of-life",
        title: `Node.js ${number} is end-of-life`,
        summary: `Node.js ${number} no longer receives security or bug fixes.`,
        severity: "high",
        ...(replacementMajor !== undefined ? { replacement: `Node.js ${replacementMajor} LTS or later` } : {}),
        deadline: entry.end,
        sources: [SOURCE],
        ...(replacementMajor !== undefined ? { migration: migration(replacementMajor) } : {}),
        "x-nodejs": { major: number },
      });
    }

    if (older.length > 0) {
      notes.push(`Skipped ${older.length} release line${older.length === 1 ? "" : "s"} older than v${FIRST_DRAFTED_MAJOR} (${older[0]}${older.length > 1 ? ` to ${older[older.length - 1]}` : ""}); the hand-written nodejs.runtime.legacy rule covers ${older.length === 1 ? "it" : "them"}.`);
    }
    if (notYet.length > 0) notes.push(`Not yet end-of-life: ${notYet.join(", ")}.`);
    return { rules, notes };
  },
};
