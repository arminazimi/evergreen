export interface ScaffoldNames {
  /** The detector id: lowercase letters, digits, and single hyphens. */
  id: string;
  /** The registry ecosystem slug; defaults to the id. */
  ecosystem: string;
  /** The identifier used in TypeScript: `go-modules` becomes `goModules`. */
  camel: string;
  /** The type-name form: `go-modules` becomes `GoModules`. */
  pascal: string;
  /** A readable name: `go-modules` becomes `Go modules`. */
  title: string;
}

export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Rule ids are lowercase, dotted or hyphenated, and start with the ecosystem: npm.package.request.deprecated. */
export const RULE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;

export interface RuleScaffoldNames {
  /** The rule id, also the module its placeholder fixture imports. */
  id: string;
  /** The registry the rule belongs to. */
  ecosystem: string;
}

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export function scaffoldNames(id: string, ecosystem: string = id): ScaffoldNames {
  if (!ID_PATTERN.test(id)) {
    throw new ScaffoldError(`"${id}" is not a valid detector id. Use lowercase letters, digits, and single hyphens, starting with a letter (for example go-modules).`);
  }
  if (!ID_PATTERN.test(ecosystem)) {
    throw new ScaffoldError(`"${ecosystem}" is not a valid ecosystem slug. Use lowercase letters, digits, and single hyphens.`);
  }
  const words = id.split("-");
  const camel = words.map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join("");
  const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  const title = [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
  return { id, ecosystem, camel, pascal, title };
}

export function ruleScaffoldNames(id: string, ecosystem?: string): RuleScaffoldNames {
  if (!RULE_ID_PATTERN.test(id)) {
    throw new ScaffoldError(`"${id}" is not a valid rule id. Use lowercase letters, numbers, dots, and hyphens, with at least two segments (for example npm.package.request.deprecated).`);
  }
  const resolved = ecosystem ?? id.split(".")[0]!;
  if (!ID_PATTERN.test(resolved)) {
    throw new ScaffoldError(`"${resolved}" is not a valid ecosystem slug. Use lowercase letters, digits, and single hyphens.`);
  }
  return { id, ecosystem: resolved };
}
