import { ruleVersion } from "../../src/detectors/kubernetes/api-version.js";
import type { DraftRule, Importer } from "./types.js";

export const KUBERNETES_DEPRECATION_GUIDE_URL = "https://kubernetes.io/docs/reference/using-api/deprecation-guide/";
const GUIDE_TITLE = "Kubernetes Deprecated API Migration Guide";

/**
 * The release announcement of each Kubernetes minor release that stopped serving an API version.
 *
 * The migration guide names the release ("no longer served as of v1.25") but not a date, and the
 * release history on kubernetes.io lists end-of-life dates, not the day a minor was first released.
 * A rule's `deadline` is therefore the date of the release announcement published on kubernetes.io.
 * Each row is a dated fact: `date` is the day on the announcement page and in its URL. Add a row,
 * checked against the page, when the guide starts naming another release. A release without a row
 * is drafted without a deadline and named in the notes.
 */
export const RELEASE_ANNOUNCEMENTS: Readonly<Record<string, { date: string; title: string; url: string }>> = {
  "1.16": {
    date: "2019-09-18",
    title: "Kubernetes 1.16: Custom Resources, Overhauled Metrics, and Volume Extensions",
    url: "https://kubernetes.io/blog/2019/09/18/kubernetes-1-16-release-announcement/",
  },
  "1.22": {
    date: "2021-08-04",
    title: "Kubernetes 1.22: Reaching New Peaks",
    url: "https://kubernetes.io/blog/2021/08/04/kubernetes-1-22-release-announcement/",
  },
  "1.25": {
    date: "2022-08-23",
    title: "Kubernetes v1.25: Combiner",
    url: "https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/",
  },
  "1.26": {
    date: "2022-12-09",
    title: "Kubernetes v1.26: Electrifying",
    url: "https://kubernetes.io/blog/2022/12/09/kubernetes-v1-26-release/",
  },
  "1.27": {
    date: "2023-04-11",
    title: "Kubernetes v1.27: Chill Vibes",
    url: "https://kubernetes.io/blog/2023/04/11/kubernetes-v1-27-release/",
  },
  "1.29": {
    date: "2023-12-13",
    title: "Kubernetes v1.29: Mandala",
    url: "https://kubernetes.io/blog/2023/12/13/kubernetes-v1-29-release/",
  },
  "1.32": {
    date: "2024-12-11",
    title: "Kubernetes v1.32: Penelope",
    url: "https://kubernetes.io/blog/2024/12/11/kubernetes-v1-32-release/",
  },
};

interface Removal {
  /** `group/version`, for example `extensions/v1beta1`. */
  apiVersion: string;
  kind: string;
  /** The minor release that stopped serving it, for example `1.22`. */
  release: string;
  /** What the guide says to move to, as a `group/version` (with its first release) or as text. */
  replacement?: { apiVersion: string; since?: string } | { text: string };
}

const API_VERSION = String.raw`[a-z0-9][a-z0-9.-]*\/v\d+(?:alpha\d+|beta\d+)?`;
const KIND = String.raw`[A-Z][A-Za-z0-9]*`;
const list = (item: string) => String.raw`${item}(?:, (?:and )?${item}|,? and ${item})*`;
const RELEASE = String.raw`no longer served as of v(1\.\d+)`;

// "The a/v1beta1 and b/v1beta2 API versions of A and B are no longer served as of v1.16."
const VERSIONS_OF_KINDS = new RegExp(String.raw`The (${list(API_VERSION)}) API versions? of (${list(KIND)}) (?:is|are) ${RELEASE}`, "g");
// "PodSecurityPolicy in the policy/v1beta1 API version is no longer served as of v1.25"
const KIND_IN_VERSION = new RegExp(String.raw`(${KIND}) in the (${API_VERSION}) API version is ${RELEASE}`, "g");

function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1");
}

/** What the guide says to move to, read from the text that follows a statement. */
function replacementAfter(text: string): Removal["replacement"] {
  const use = new RegExp(String.raw`^.{0,400}?Migrate manifests and API clients? to use the (${API_VERSION}|v\d+) API version(?:, available since (v1\.\d+))?`).exec(text);
  if (use) return { apiVersion: use[1]!, ...(use[2] ? { since: use[2] } : {}) };
  const to = /^.{0,400}?Migrate to ([^.]+)\./.exec(text);
  return to?.[1] ? { text: to[1].trim() } : undefined;
}

/** Every removal the guide states, and how many statements they came from. */
function removals(text: string): { found: Removal[]; sentences: number } {
  const found: Array<Removal & { at: number; length: number }> = [];
  let sentences = 0;

  for (const match of text.matchAll(VERSIONS_OF_KINDS)) {
    sentences++;
    const versions = match[1]!.match(new RegExp(API_VERSION, "g")) ?? [];
    const kinds = (match[2]!.match(new RegExp(KIND, "g")) ?? []).filter((kind) => kind !== "And");
    for (const apiVersion of versions) {
      for (const kind of kinds) found.push({ apiVersion, kind, release: match[3]!, at: match.index!, length: match[0].length });
    }
  }
  for (const match of text.matchAll(KIND_IN_VERSION)) {
    sentences++;
    found.push({ apiVersion: match[2]!, kind: match[1]!, release: match[3]!, at: match.index!, length: match[0].length });
  }

  // The text after a statement, up to the next one, holds its replacement.
  const starts = [...new Set(found.map((entry) => entry.at))].sort((left, right) => left - right);
  return {
    sentences,
    found: found.map(({ at, length, ...removal }) => {
      const next = starts.find((start) => start > at) ?? text.length;
      const replacement = replacementAfter(text.slice(at + length, next));
      return replacement ? { ...removal, replacement } : removal;
    }),
  };
}

function replacementText(removal: Removal): string | undefined {
  const replacement = removal.replacement;
  if (!replacement) return undefined;
  if ("text" in replacement) return replacement.text;
  return `${replacement.apiVersion} ${removal.kind}${replacement.since ? `, available since ${replacement.since}` : ""}`;
}

function rule(removal: Removal): DraftRule | undefined {
  const [group, version] = removal.apiVersion.split("/") as [string, string];
  const semver = ruleVersion(version);
  if (!semver) return undefined;
  const announcement = RELEASE_ANNOUNCEMENTS[removal.release];
  const replacement = replacementText(removal);
  const released = announcement ? `, which was released on ${announcement.date}` : "";
  return {
    id: `kubernetes.${group.replace(/\./g, "-")}.${removal.kind.toLowerCase()}.${version}.removed`,
    ecosystem: "kubernetes",
    purl: `pkg:generic/kubernetes/${group}/${removal.kind}`,
    vers: `vers:semver/${semver}`,
    event: "removed",
    title: `${removal.kind} ${removal.apiVersion} is no longer served`,
    summary: `The Kubernetes Deprecated API Migration Guide states that the ${removal.apiVersion} API version of ${removal.kind} is no longer served as of v${removal.release}${released}.`,
    severity: "high",
    ...(replacement ? { replacement } : {}),
    ...(announcement ? { deadline: announcement.date } : {}),
    sources: [
      { title: GUIDE_TITLE, url: KUBERNETES_DEPRECATION_GUIDE_URL },
      ...(announcement ? [{ title: `${announcement.title} (release announcement, ${announcement.date})`, url: announcement.url }] : []),
    ],
  };
}

export const kubernetesDeprecationGuideImporter: Importer = {
  id: "kubernetes-1",
  ecosystem: "kubernetes",
  description: "API versions the Kubernetes Deprecated API Migration Guide says are no longer served, one removed rule per group, kind, and version",
  sources: [{ title: GUIDE_TITLE, url: KUBERNETES_DEPRECATION_GUIDE_URL }],

  async import(context) {
    const text = pageText(await context.fetchText(KUBERNETES_DEPRECATION_GUIDE_URL, { accept: "text/html" }));
    const { found, sentences } = removals(text);
    if (found.length === 0) return { rules: [], notes: ["No removal statements were found in the migration guide."] };

    const rules = found.map(rule).filter((draft): draft is DraftRule => draft !== undefined);
    const unknown = [...new Set(found.map((entry) => entry.release))]
      .filter((release) => !RELEASE_ANNOUNCEMENTS[release])
      .sort((left, right) => Number(left.split(".")[1]) - Number(right.split(".")[1]));

    const notes: string[] = [];
    if (unknown.length > 0) {
      notes.push(`No verified release date for ${unknown.map((release) => `v${release}`).join(", ")}; those rules have no deadline until a row is added to RELEASE_ANNOUNCEMENTS.`);
    }
    if (rules.length < found.length) {
      notes.push(`${found.length - rules.length} API versions were skipped because their version is not in the vN, vNalphaM, or vNbetaM form.`);
    }
    const stated = (text.match(/no longer served as of v1\.\d+/g) ?? []).length;
    if (stated > sentences) notes.push(`${stated - sentences} removal statements do not match a known sentence form and were not drafted.`);
    return { rules, notes };
  },
};
