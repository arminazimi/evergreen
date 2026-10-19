import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../../sdk.js";
import { versContains } from "../../vers.js";
import { parseAzurePipelines } from "./parse-azure-pipelines.js";
import { parseCircleci } from "./parse-circleci.js";
import { parseGitlabCi } from "./parse-gitlab-ci.js";

/**
 * Finds CI runner images whose release line has a reviewed lifecycle rule, at the exact declaration.
 *
 * It reads the root `.gitlab-ci.yml`, `.circleci/config.yml`, and `azure-pipelines.yml`, and nothing else
 * (decision 0014). Azure hosted-image labels are matched against registry rules with the label-to-PURL/VERS
 * normalization recorded in that decision. GitLab references are always unclassified: no GitLab lifecycle
 * source is approved. Dynamic values, floating aliases, and orb references are unclassified as the parsers
 * report them. A literal reference with no matching reviewed rule is not described as retired.
 *
 * The detector is experimental (decision 0013). It reads repository files and bundled registry data only.
 */

const CONFIGURATIONS = [
  { source: "azure", path: "azure-pipelines.yml" },
  { source: "circleci", path: ".circleci/config.yml" },
  { source: "gitlab", path: ".gitlab-ci.yml" },
] as const;

type Source = (typeof CONFIGURATIONS)[number]["source"];

const AZURE_LABEL = /^(ubuntu|macos|windows)-(\d+(?:\.\d+)*)$/;

/** A declaration a rule may judge. */
interface Declaration {
  source: Source;
  path: string;
  line: number;
  value: string;
}

/** A reference the detector reports as unclassified, with the reason written for the user. */
interface Unclassified {
  path: string;
  line: number;
  value: string;
  reason: string;
}

interface References {
  declarations: Declaration[];
  unclassified: Unclassified[];
}

interface Identity {
  purl: string;
  version: string;
}

const REASONS: Readonly<Record<string, string>> = {
  dynamic: "the value is a CI variable or template, which Evergreen does not expand",
  floating: "the value is a floating alias, so it names no release line",
  "orb-not-resolved": "the orb's contents are not resolved, so its version is not an image lifecycle claim",
  "gitlab-not-judged": "GitLab CI image references are not judged against lifecycle rules in this version",
};

/**
 * The registry identity of an Azure hosted-image label, or undefined when the label is not one family and
 * version (decision 0014, "Registry mapping"). Labels are matched case-insensitively, as Azure treats them.
 */
export function azureImageIdentity(label: string): Identity | undefined {
  const match = AZURE_LABEL.exec(label.toLowerCase());
  if (!match) return undefined;
  return { purl: `pkg:generic/azure-pipelines/${match[1]!}-image`, version: match[2]! };
}

/** The image name in a reference, without its tag, digest, or orb version. */
export function imageComponent(value: string): string {
  const withoutDigest = value.split("@")[0] ?? value;
  const colon = withoutDigest.lastIndexOf(":");
  return colon > withoutDigest.lastIndexOf("/") ? withoutDigest.slice(0, colon) : withoutDigest;
}

async function readConfiguration(root: string, path: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Every declaration and unclassified reference in the configurations the detector reads. Configurations are
 * only read at the repository root, where GitLab, CircleCI, and the default Azure path keep them.
 */
export async function collectReferences(root: string): Promise<References> {
  const declarations: Declaration[] = [];
  const unclassified: Unclassified[] = [];
  for (const configuration of CONFIGURATIONS) {
    const contents = await readConfiguration(root, configuration.path);
    if (contents === undefined) continue;
    let parsed: {
      declarations: Array<{ value: string; line: number }>;
      unclassified: Array<{ value: string; line: number; reason: string }>;
    };
    if (configuration.source === "azure") parsed = parseAzurePipelines(contents);
    else if (configuration.source === "circleci") parsed = parseCircleci(contents);
    else parsed = parseGitlabCi(contents);
    for (const declaration of parsed.declarations) {
      declarations.push({ source: configuration.source, path: configuration.path, ...declaration });
    }
    for (const reference of parsed.unclassified) {
      unclassified.push({
        path: configuration.path,
        line: reference.line,
        value: reference.value,
        reason: REASONS[reference.reason] ?? reference.reason,
      });
    }
  }
  return { declarations, unclassified };
}

function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const map = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) map.set(rule.purl, [...(map.get(rule.purl) ?? []), rule]);
  return map;
}

export class CiImagesDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "ci-images";

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const found = await collectReferences(context.root);
    if (found.declarations.length === 0 && found.unclassified.length === 0) {
      return { findings: [], unclassified: [] };
    }

    const findings: DetectorFinding[] = [];
    if (found.declarations.length > 0) {
      const registry = validateRegistryV2(await loadDataFile("registry/ci-images.json"));
      const rules = rulesByPurl(registry.rules);
      for (const declaration of found.declarations) {
        // Only Azure hosted-image labels have a recorded PURL/VERS mapping (decision 0014).
        if (declaration.source !== "azure") continue;
        const identity = azureImageIdentity(declaration.value);
        if (!identity) continue;
        const rule = (rules.get(identity.purl) ?? []).find((item) => versContains(item.vers, identity.version));
        if (!rule) continue;
        findings.push({
          id: `${rule.id}:${declaration.path}:${declaration.line}`,
          ruleId: rule.id,
          title: rule.title,
          summary: `${declaration.path} uses ${declaration.value}. ${rule.summary}`,
          severity: rule.severity,
          location: { path: declaration.path, line: declaration.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          ...(rule.migration ? { migration: rule.migration } : {}),
          sources: rule.sources,
        });
      }
    }

    const unclassified: Omit<UnclassifiedReference, "detector">[] = found.unclassified.map((reference) => ({
      component: imageComponent(reference.value),
      reference: reference.value,
      reason: reference.reason,
      location: { path: reference.path, line: reference.line },
    }));

    return { findings, unclassified };
  }
}

export const ciImagesDetector = new CiImagesDetector();
