import type { RuleScaffoldNames } from "../names.js";

/**
 * A valid `evergreen.registry.v2` rule that nothing reports in a real scan: the purl is generic, so no detector
 * matches it, and only the usage matcher sees the fixture. The author replaces every placeholder with evidence.
 */
export function ruleTemplate(names: RuleScaffoldNames, today: string): Record<string, unknown> {
  return {
    id: names.id,
    ecosystem: names.ecosystem,
    purl: `pkg:generic/${names.id}`,
    vers: "vers:semver/*",
    event: "deprecated",
    title: `Replace this placeholder rule (${names.id})`,
    summary: "Replace this placeholder with the lifecycle claim stated by an authoritative source.",
    severity: "info",
    replacement: "Replace with the replacement the source names",
    sources: [{ title: "Replace with the authoritative notice", url: `https://example.com/${names.id}` }],
    provenance: { observedAt: today, reviewedAt: today, reviewer: "unreviewed" },
    usage: [{ kind: "import", language: "javascript", module: names.id }],
  };
}

export function matchFixtureTemplate(names: RuleScaffoldNames): string {
  return `// ${names.id} must be observed here. Replace this with the smallest repository the rule should report.
const dependency = require("${names.id}");
void dependency;
`;
}

export function cleanFixtureTemplate(names: RuleScaffoldNames): string {
  return `// This lookalike must not observe ${names.id}.
const local = require("./local");
void local;
`;
}

export function ruleFixtureReadmeTemplate(names: RuleScaffoldNames, kind: "match" | "clean"): string {
  const expected = kind === "match" ? "must report" : "must not report";
  return `# ${kind} fixture for ${names.id}

\`evergreen rules test ${names.id}\` scans this directory as an untrusted repository: it ${expected} the rule.

Replace \`index.js\` with the smallest repository that shows the behavior you want. Fixtures are reviewed with the
rule; when the rule or its detector changes, update them in the same pull request.
`;
}
