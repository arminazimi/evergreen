import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const PYTHON_RELEASE_CYCLE_URL = "https://peps.python.org/api/release-cycle.json";

interface ReleaseLine {
  status?: string;
  first_release?: string;
  end_of_life?: string;
  pep?: number;
}

// The Python detector reads a single runtime rule: "Python X.Y and older are end-of-life". This importer
// drafts exactly that rule, so a draft is something the detector can use. A rule per release line needs
// detector support first.

const SOURCES = (pep: number | undefined, version: string) => [
  { title: "Status of Python versions", url: "https://devguide.python.org/versions/" },
  { title: "Python release cycle (machine-readable)", url: PYTHON_RELEASE_CYCLE_URL },
  ...(pep ? [{ title: `PEP ${pep} — Python ${version} release schedule`, url: `https://peps.python.org/pep-${String(pep).padStart(4, "0")}/` }] : []),
];

const MIGRATION: NonNullable<DraftRule["migration"]> = {
  constraints: [
    "Keep project metadata, local version files, CI matrices, containers, and deployment runtimes on a mutually supported Python version.",
    "Confirm binary wheels and framework dependencies support the selected Python release.",
  ],
  steps: [
    {
      id: "update-python-declaration",
      title: "Update the Python requirement",
      instructions: "Raise the reported requires-python range or pinned runtime to a supported Python release.",
      targets: "declaration",
    },
    {
      id: "align-python-runtimes",
      title: "Align runtime surfaces",
      instructions: "Update matching version files, CI matrices, container images, and deployment configuration.",
      targets: "all",
    },
  ],
  verification: [
    { command: "python --version", purpose: "Confirm the active Python runtime is supported." },
    { command: "python -m pytest", purpose: "Run the Python test suite on the target runtime." },
    { command: "python -m pip check", purpose: "Check installed dependency compatibility." },
  ],
};

/** A full date is exact. A year and month ("2031-10") is how the schedule announces a future end of life. */
function endDate(value: unknown): { date: string; exact: boolean } | undefined {
  if (isIsoDate(value)) return { date: value, exact: true };
  const month = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (!month) return undefined;
  const year = Number(month[1]);
  const lastDay = new Date(Date.UTC(year, Number(month[2]), 0)).getUTCDate();
  const date = `${month[1]}-${month[2]}-${String(lastDay).padStart(2, "0")}`;
  return isIsoDate(date) ? { date, exact: false } : undefined;
}

function scheduledRule(entry: { name: string; major: number; minor: number; line: ReleaseLine }, end: string): DraftRule {
  return {
    id: `python.runtime.eol-${entry.name}-and-older`,
    ecosystem: "python",
    purl: "pkg:generic/python",
    vers: `vers:pypi/>=${entry.major}.${entry.minor}|<${entry.major}.${entry.minor + 1}`,
    event: "scheduled-end-of-life",
    title: `Python ${entry.name} reaches end-of-life on ${end}`,
    summary: `Python ${entry.name} is scheduled to stop receiving security fixes from the Python core team on ${end}.`,
    severity: "low",
    replacement: "A supported Python release",
    deadline: end,
    sources: SOURCES(entry.line?.pep, entry.name),
    migration: MIGRATION,
    "x-python": { kind: "runtime", maximumVersion: entry.name, scheduled: true },
  };
}

export const pythonReleaseCycleImporter: Importer = {
  id: "python-release-cycle",
  ecosystem: "python",
  description: "The newest Python release line that has reached end of life, from the Python release cycle",
  sources: [{ title: "Python release cycle", url: PYTHON_RELEASE_CYCLE_URL }],

  async import(context) {
    const cycle = await fetchJson<Record<string, ReleaseLine>>(context, PYTHON_RELEASE_CYCLE_URL);
    const today = isoDate(context.now);
    const notes: string[] = [];

    const lines = Object.entries(cycle)
      .map(([name, line]) => {
        const match = /^(\d+)\.(\d+)$/.exec(name);
        return match ? { name, major: Number(match[1]), minor: Number(match[2]), line } : undefined;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      .sort((left, right) => left.major - right.major || left.minor - right.minor);
    for (const name of Object.keys(cycle).filter((key) => !/^(\d+)\.(\d+)$/.test(key)).sort()) {
      notes.push(`Skipped ${name}: not a release line name this importer understands.`);
    }

    // A line is end-of-life when the schedule says so, or when its exact end date has passed.
    const ended = (entry: (typeof lines)[number]) => {
      const end = endDate(entry.line?.end_of_life);
      const byStatus = entry.line?.status === "end-of-life";
      const byDate = end?.exact === true && end.date <= today;
      if (byDate && !byStatus) notes.push(`Python ${entry.name}: the end date ${end!.date} has passed but the schedule's status is "${entry.line?.status}".`);
      if (byStatus && end?.exact && end.date > today) notes.push(`Python ${entry.name}: the schedule's status is end-of-life but its end date ${end.date} is in the future.`);
      return byStatus || byDate;
    };
    const endedLines = lines.filter(ended);
    const newest = endedLines[endedLines.length - 1];
    const notYet = lines.filter((entry) => !endedLines.includes(entry));

    // An announced end within a year becomes a scheduled rule for that one line (decision 0010); a later one is only noted.
    const horizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const scheduled: DraftRule[] = [];
    const later: typeof notYet = [];
    for (const entry of notYet) {
      const end = endDate(entry.line?.end_of_life);
      if (!end || end.date > horizon || end.date <= today) later.push(entry);
      else scheduled.push(scheduledRule(entry, end.date));
    }
    if (later.length > 0) {
      notes.push(`Not yet end-of-life: ${later.map((entry) => `${entry.name} (ends ${entry.line?.end_of_life ?? "unknown"})`).join(", ")}.`);
    }
    if (!newest) {
      notes.push("No Python release line has reached end of life, so there is nothing to draft.");
      return { rules: scheduled, notes };
    }

    // "and older" is only true if every older line has ended too.
    const stillSupportedBelow = notYet.filter((entry) => entry.major < newest.major || (entry.major === newest.major && entry.minor < newest.minor));
    if (stillSupportedBelow.length > 0) {
      notes.push(`Not drafted: Python ${newest.name} has ended but ${stillSupportedBelow.map((entry) => entry.name).join(", ")} has not, so "and older" would be wrong.`);
      return { rules: scheduled, notes };
    }

    const end = endDate(newest.line?.end_of_life);
    if (!end) {
      notes.push(`Not drafted: the schedule gives no usable end date for Python ${newest.name}.`);
      return { rules: scheduled, notes };
    }
    if (!end.exact) notes.push(`Python ${newest.name} has no exact end date yet; the deadline is the last day of its end month.`);

    const version = newest.name;
    return {
      rules: [{
        id: `python.runtime.eol-${version}-and-older`,
        ecosystem: "python",
        purl: "pkg:generic/python",
        vers: `vers:pypi/<${newest.major}.${newest.minor + 1}`,
        event: "end-of-life",
        title: `Python ${version} and older are end-of-life`,
        summary: "These Python release lines no longer receive security or bug fixes from the Python core team.",
        severity: "high",
        replacement: "A supported Python release",
        deadline: end.date,
        sources: SOURCES(newest.line?.pep, version),
        migration: MIGRATION,
        "x-python": { kind: "runtime", maximumVersion: version },
      }, ...scheduled],
      notes,
    };
  },
};
