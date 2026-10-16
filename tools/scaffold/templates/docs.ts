import type { ScaffoldNames } from "../names.js";

/** `docs/detectors/<id>.md`: the page contributors fill in as the detector grows. */
export function docsTemplate(names: ScaffoldNames): string {
  return `# ${names.title} detector

Detector id: \`${names.id}\` · Registry: \`registry/${names.id}.json\` · Fixtures: \`tests/fixtures/${names.id}/\`

## What it reads

Describe the files and declarations this detector parses, and which it deliberately does not.

## Rules

Link the sources behind the rules. Every rule needs an authoritative, versioned source; see [Lifecycle rules](../RULES.md).

## Limits

State what produces no finding on purpose (for example dynamic references), and how unclassifiable input is reported.
`;
}
