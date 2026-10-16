import type { ScaffoldNames } from "../names.js";

/** The README that explains the fixture folder, and the placeholder files that keep each fixture a real directory. */
export function fixtureReadmeTemplate(names: ScaffoldNames): string {
  return `# ${names.title} fixtures

Each directory here is a small repository that the ${names.id} detector scans in \`tests/${names.id}-detector.test.ts\`.

| Directory | Contains | Expected |
| --- | --- | --- |
| \`zero/\` | A repository with ${names.ecosystem} declarations that are all supported | no findings |
| \`malformed/\` | Broken or truncated ${names.ecosystem} declarations | no findings, and no crash |

Add one directory per rule, with a declaration the rule should report, and assert its exact findings in the test.
Keep fixtures tiny, and write only what the detector reads. Fixtures are scanned as untrusted input.
`;
}

export function fixturePlaceholder(names: ScaffoldNames, kind: "zero" | "malformed"): string {
  return kind === "zero"
    ? `Replace this file with the smallest ${names.ecosystem} project whose declarations are all supported.\n`
    : `Replace this file with broken or truncated ${names.ecosystem} declarations.\n`;
}
