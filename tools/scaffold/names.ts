export interface ScaffoldNames {
  /** The detector id: lowercase letters, digits, and single hyphens. */
  id: string;
  /** The registry ecosystem slug; defaults to the id. */
  ecosystem: string;
  /** The identifier used in TypeScript: `go-modules` becomes `goModules`. */
  camel: string;
  /** A readable name: `go-modules` becomes `Go modules`. */
  title: string;
}

export const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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
  const title = [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(" ");
  return { id, ecosystem, camel, title };
}
