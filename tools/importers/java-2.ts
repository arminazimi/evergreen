import { formatPurl } from "../../src/purl.js";
import { versionScheme } from "../../src/vers/index.js";
import { MAVEN_CANDIDATES } from "./maven-candidates.js";
import { ImporterError } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";

export const MAVEN_CENTRAL = "https://repo1.maven.org/maven2";
const SCANNED_VERSIONS = 10;
const MAX_MESSAGE = 280;
const COORDINATE = /^[a-z0-9][a-z0-9._-]*$/;

const path = (group: string, artifact: string) => `${MAVEN_CENTRAL}/${group.replace(/\./g, "/")}/${artifact}`;
export const metadataUrl = (group: string, artifact: string) => `${path(group, artifact)}/maven-metadata.xml`;
export const pomUrl = (group: string, artifact: string, version: string) => `${path(group, artifact)}/${version}/${artifact}-${version}.pom`;

interface Relocation {
  group?: string;
  artifact?: string;
  message?: string;
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)?.[1];

/** The `<relocation>` of a POM, or undefined when it declares none. */
function relocationOf(pom: string): Relocation | undefined {
  const block = /<relocation>([\s\S]*?)<\/relocation>/.exec(pom)?.[1];
  if (block === undefined) return undefined;
  const message = tag(block, "message")?.replace(/\s+/g, " ").trim();
  return {
    ...(tag(block, "groupId") ? { group: tag(block, "groupId")! } : {}),
    ...(tag(block, "artifactId") ? { artifact: tag(block, "artifactId")! } : {}),
    ...(message ? { message: message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1).trimEnd()}…` : message } : {}),
  };
}

/** A missing file is a note; any other failure stops the run, so an outage never looks like "nothing moved". */
async function fetchOrMissing(context: ImporterContext, url: string): Promise<string | undefined> {
  try {
    return await context.fetchText(url, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" });
  } catch (error) {
    if (error instanceof ImporterError && /HTTP 404/.test(error.message)) return undefined;
    throw error;
  }
}

export const mavenRelocationImporter: Importer = {
  id: "java-2",
  ecosystem: "java",
  description: "Maven dependencies whose own POM declares a relocation to new coordinates",
  sources: [{ title: "Maven Central", url: MAVEN_CENTRAL }],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const compare = versionScheme("maven").compare;

    for (const candidate of MAVEN_CANDIDATES) {
      const [group, artifact] = candidate.split(":") as [string, string];
      if (!COORDINATE.test(group) || !COORDINATE.test(artifact)) {
        notes.push(`${candidate} was skipped: its coordinates are not lowercase letters, digits, dots, and hyphens.`);
        continue;
      }
      const metadata = await fetchOrMissing(context, metadataUrl(group, artifact));
      if (metadata === undefined) {
        notes.push(`${candidate} was not found on Maven Central.`);
        continue;
      }
      const listed = [...metadata.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((match) => match[1]!);
      const newest = tag(metadata, "release") ?? tag(metadata, "latest") ?? [...listed].sort(compare).at(-1);
      if (!newest) {
        notes.push(`${candidate} has no versions in its metadata.`);
        continue;
      }
      const scanned = [...new Set([newest, ...listed])]
        .filter((version) => compare(version, newest) <= 0)
        .sort(compare)
        .reverse()
        .slice(0, SCANNED_VERSIONS);

      // Walk down from the newest version while each POM still declares the same relocation.
      let first: Relocation | undefined;
      let lowest: string | undefined;
      let url = "";
      for (const version of scanned) {
        const pom = await fetchOrMissing(context, pomUrl(group, artifact, version));
        const relocation = pom === undefined ? undefined : relocationOf(pom);
        if (!relocation) break;
        if (first && (first.group !== relocation.group || first.artifact !== relocation.artifact)) break;
        first ??= relocation;
        lowest = version;
        if (version === newest) url = pomUrl(group, artifact, version);
      }
      if (!first || !lowest) {
        notes.push(`${candidate} ${newest} does not declare a relocation.`);
        continue;
      }
      const targetGroup = first.group ?? group;
      const targetArtifact = first.artifact ?? artifact;
      if (targetGroup === group && targetArtifact === artifact) {
        notes.push(`${candidate} was skipped: its relocation keeps the same coordinates and only changes the version.`);
        continue;
      }

      const target = `${targetGroup}:${targetArtifact}`;
      rules.push({
        id: `java.maven.${group}.${artifact}.relocated`,
        ecosystem: "java",
        purl: formatPurl({ type: "maven", namespace: group, name: artifact }),
        vers: `vers:maven/>=${lowest}`,
        event: "deprecated",
        title: `${candidate} has moved to ${target}`,
        summary: `The POM of ${candidate} ${newest} declares a relocation to ${target}.${first.message ? ` Its message says: "${first.message}"` : ""}`,
        severity: "medium",
        replacement: target,
        sources: [{ title: `${candidate} ${newest} POM on Maven Central`, url }],
      });
    }
    return { rules, notes };
  },
};
