import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const NODEJS_SCHEDULE_URL = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";
export const PYTHON_RELEASE_CYCLE_URL = "https://peps.python.org/api/release-cycle.json";
export const OFFICIAL_IMAGES_NODE_URL = "https://raw.githubusercontent.com/docker-library/official-images/master/library/node";
export const OFFICIAL_IMAGES_PYTHON_URL = "https://raw.githubusercontent.com/docker-library/official-images/master/library/python";

const NODE_SOURCES = [
  { title: "Node.js end-of-life releases", url: "https://nodejs.org/en/about/eol" },
  { title: "Node.js Release Working Group schedule", url: "https://github.com/nodejs/Release/blob/main/schedule.json" },
];
const PYTHON_SOURCES = [
  { title: "Status of Python versions", url: "https://devguide.python.org/versions/" },
  { title: "Python release cycle (machine-readable)", url: PYTHON_RELEASE_CYCLE_URL },
];

const MIGRATION_STEPS: NonNullable<DraftRule["migration"]>["steps"] = [
  {
    id: "update-image-declaration",
    title: "Update the base image",
    instructions: "Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.",
    targets: "declaration",
  },
  {
    id: "align-image-surfaces",
    title: "Align other image references",
    instructions: "Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.",
    targets: "all",
  },
];

const BUILD: NonNullable<DraftRule["migration"]>["verification"][number] = { command: "docker build .", purpose: "Build the image on the new base." };

/** The tag names listed in a docker-library "library/<image>" file. */
export function officialTags(text: string): Set<string> {
  const tags = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^Tags:\s*(.+)$/.exec(line);
    if (match) for (const tag of match[1]!.split(",")) tags.add(tag.trim());
  }
  return tags;
}

const publishes = (tags: ReadonlySet<string>, line: string) => [...tags].some((tag) => tag === line || tag.startsWith(`${line}-`) || tag.startsWith(`${line}.`));

interface NodeEntry { end?: string; lts?: string }
interface PythonEntry { status?: string; end_of_life?: string; pep?: number }

export const containerOfficialImagesImporter: Importer = {
  id: "container-official-images",
  ecosystem: "container",
  description: "End-of-life release lines of the Node.js and Python official images, from the vendors' own schedules; the Docker Official Images files only say which lines still have published tags",
  sources: [...NODE_SOURCES, ...PYTHON_SOURCES, { title: "Docker Official Images", url: "https://github.com/docker-library/official-images" }],

  async import(context) {
    const today = isoDate(context.now);
    const notes: string[] = [];
    const rules: DraftRule[] = [];

    // Node.js: "and older" is only true while every older line has ended too.
    const schedule = await fetchJson<Record<string, NodeEntry>>(context, NODEJS_SCHEDULE_URL);
    const nodeTags = officialTags(await context.fetchText(OFFICIAL_IMAGES_NODE_URL));
    const majors = Object.entries(schedule)
      .map(([name, entry]) => ({ name, entry, match: /^v(\d+)$/.exec(name) }))
      .filter((line) => line.match)
      .map((line) => ({ major: Number(line.match![1]), end: isIsoDate(line.entry?.end) ? line.entry.end : undefined, lts: line.entry?.lts }))
      .sort((left, right) => left.major - right.major);
    const firstSupported = majors.find((line) => line.end === undefined || line.end > today);
    const ended = majors.filter((line) => firstSupported !== undefined && line.major < firstSupported.major);
    const newest = ended[ended.length - 1];
    // An announced end within a year becomes a scheduled rule for that one line (decision 0010); a later one is only noted.
    const horizon = isoDate(new Date(Date.UTC(context.now.getUTCFullYear() + 1, context.now.getUTCMonth(), context.now.getUTCDate())));
    const supportedLts = majors.find((line) => line.end !== undefined && line.end > today && isIsoDate(line.lts) && line.lts <= today);
    for (const line of majors.filter((candidate) => candidate.end !== undefined && candidate.end > today && candidate.end <= horizon)) {
      const replacement = majors.find((candidate) => candidate.major > line.major && candidate.end !== undefined && candidate.end > today && isIsoDate(candidate.lts) && candidate.lts <= today)?.major;
      rules.push({
        id: `container.node.eol-${line.major}-and-older`,
        ecosystem: "container",
        purl: "pkg:docker/library/node",
        vers: `vers:semver/>=${line.major}.0.0|<${line.major + 1}.0.0`,
        event: "scheduled-end-of-life",
        title: `Node.js image release line ${line.major} reaches end-of-life on ${line.end}`,
        summary: `Node.js ${line.major} is scheduled to stop receiving security and bug fixes on ${line.end}, so images tagged with it will then be built on an unsupported runtime.`,
        severity: "low",
        replacement: `A node image on a later supported release line${replacement === undefined ? "" : `, such as node:${replacement}`}`,
        deadline: line.end!,
        sources: NODE_SOURCES,
        migration: {
          constraints: [
            "Keep the Dockerfile base image, Compose image, CI service containers, and the engines field in package.json on one supported Node.js release line.",
            "Confirm native modules and production dependencies support the target Node.js major.",
          ],
          steps: MIGRATION_STEPS,
          verification: [BUILD, { command: "docker run --rm IMAGE node --version", purpose: "Confirm the container runs the intended Node.js version." }],
        },
      });
    }
    if (newest && firstSupported && ended.every((line) => line.end !== undefined)) {
      const deadline = ended.map((line) => line.end!).sort().at(-1)!;
      rules.push({
        id: `container.node.eol-${newest.major}-and-older`,
        ecosystem: "container",
        purl: "pkg:docker/library/node",
        vers: `vers:semver/<${firstSupported.major}.0.0`,
        event: "end-of-life",
        title: `Node.js image release lines ${newest.major} and older are end-of-life`,
        summary: "These Node.js release lines no longer receive security or bug fixes, so images tagged with them are built on an unsupported runtime.",
        severity: "high",
        replacement: `A node image on a supported release line, such as node:${supportedLts?.major ?? firstSupported.major}`,
        deadline,
        sources: NODE_SOURCES,
        migration: {
          constraints: [
            "Keep the Dockerfile base image, Compose image, CI service containers, and the engines field in package.json on one supported Node.js release line.",
            "Confirm native modules and production dependencies support the target Node.js major.",
          ],
          steps: MIGRATION_STEPS,
          verification: [BUILD, { command: "docker run --rm IMAGE node --version", purpose: "Confirm the container runs the intended Node.js version." }],
        },
      });
      const stillPublished = ended.filter((line) => publishes(nodeTags, String(line.major))).map((line) => line.major);
      if (stillPublished.length > 0) notes.push(`Node.js lines ${stillPublished.join(", ")} are end-of-life but still have tags in the Docker Official Images file; a published tag does not make a line supported.`);
    } else {
      notes.push("Node.js: no end-of-life release line could be drafted from the schedule.");
    }

    // Python: the newest ended line, if every older line has ended too.
    const cycle = await fetchJson<Record<string, PythonEntry>>(context, PYTHON_RELEASE_CYCLE_URL);
    const pythonTags = officialTags(await context.fetchText(OFFICIAL_IMAGES_PYTHON_URL));
    const lines = Object.entries(cycle)
      .map(([name, entry]) => ({ name, entry, match: /^(\d+)\.(\d+)$/.exec(name) }))
      .filter((line) => line.match)
      .map((line) => ({ name: line.name, major: Number(line.match![1]), minor: Number(line.match![2]), entry: line.entry }))
      .sort((left, right) => left.major - right.major || left.minor - right.minor);
    const isEnded = (line: (typeof lines)[number]) => line.entry?.status === "end-of-life" || (isIsoDate(line.entry?.end_of_life) && line.entry.end_of_life <= today);
    const firstLive = lines.find((line) => !isEnded(line));
    const endedPython = lines.filter((line) => firstLive !== undefined && (line.major < firstLive.major || (line.major === firstLive.major && line.minor < firstLive.minor)));
    const newestPython = endedPython[endedPython.length - 1];
    const pythonEnd = newestPython?.entry?.end_of_life;
    for (const line of lines) {
      const end = line.entry?.end_of_life;
      const monthEnd = typeof end === "string" && /^\d{4}-\d{2}$/.test(end) ? isoDate(new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0))) : isIsoDate(end) ? end : undefined;
      if (isEnded(line) || monthEnd === undefined || monthEnd <= today || monthEnd > horizon) continue;
      rules.push({
        id: `container.python.eol-${line.name}-and-older`,
        ecosystem: "container",
        purl: "pkg:docker/library/python",
        vers: `vers:semver/>=${line.major}.${line.minor}.0|<${line.major}.${line.minor + 1}.0`,
        event: "scheduled-end-of-life",
        title: `Python image release line ${line.name} reaches end-of-life on ${monthEnd}`,
        summary: `Python ${line.name} is scheduled to stop receiving security fixes from the Python core team on ${monthEnd}, so images tagged with it will then be built on an unsupported runtime.`,
        severity: "low",
        replacement: "A python image on a later supported release line",
        deadline: monthEnd,
        sources: PYTHON_SOURCES,
        migration: {
          constraints: [
            "Keep the base image, requires-python, CI matrices, and deployment runtimes on one supported Python release.",
            "Confirm binary wheels and dependencies support the target Python release; rebuild any virtual environment or wheel cache inside the image.",
          ],
          steps: MIGRATION_STEPS,
          verification: [BUILD, { command: "docker run --rm IMAGE python --version", purpose: "Confirm the container runs the intended Python version." }],
        },
      });
    }
    if (newestPython && firstLive && isIsoDate(pythonEnd)) {
      rules.push({
        id: `container.python.eol-${newestPython.name}-and-older`,
        ecosystem: "container",
        purl: "pkg:docker/library/python",
        vers: `vers:semver/<${firstLive.major}.${firstLive.minor}.0`,
        event: "end-of-life",
        title: `Python image release lines ${newestPython.name} and older are end-of-life`,
        summary: "These Python release lines no longer receive security or bug fixes from the Python core team.",
        severity: "high",
        replacement: "A python image on a supported release line",
        deadline: pythonEnd,
        sources: PYTHON_SOURCES,
        migration: {
          constraints: [
            "Keep the base image, requires-python, CI matrices, and deployment runtimes on one supported Python release.",
            "Confirm binary wheels and dependencies support the target Python release; rebuild any virtual environment or wheel cache inside the image.",
          ],
          steps: MIGRATION_STEPS,
          verification: [BUILD, { command: "docker run --rm IMAGE python --version", purpose: "Confirm the container runs the intended Python version." }],
        },
      });
      const stillPublished = endedPython.filter((line) => publishes(pythonTags, line.name)).map((line) => line.name);
      if (stillPublished.length > 0) notes.push(`Python lines ${stillPublished.join(", ")} are end-of-life but still have tags in the Docker Official Images file; a published tag does not make a line supported.`);
    } else {
      notes.push("Python: no end-of-life release line could be drafted from the release cycle.");
    }

    notes.push("PostgreSQL, MySQL, and Ruby image rules have no machine-readable vendor source and stay hand-written.");
    return { rules, notes };
  },
};
