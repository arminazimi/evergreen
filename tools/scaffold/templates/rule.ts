import type { RuleScaffoldNames } from "../names.js";

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

Replace \`index.js\` with the smallest repository that shows the behavior you want. The rule itself lives in
@velella/ebb. When the detector changes, update these fixtures in the same pull request; when an update of
@velella/ebb changes the rule, update them in the pull request that updates it.
`;
}
