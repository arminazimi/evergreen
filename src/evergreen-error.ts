/**
 * The one error model. Every failure a user can see carries a stable reason code, and the code decides the failure
 * class: the CLI maps the class to an exit code and the MCP server reports the same code on its error results.
 */

/** The failure classes and their exit codes. `policy` (1) and `usage` (2) keep the codes Evergreen has always used. */
export const EXIT_CODES = {
  policy: 1,
  usage: 2,
  data: 3,
  parse: 4,
  internal: 5,
} as const;
export type FailureClass = keyof typeof EXIT_CODES;

/** Every stable reason code and the class it belongs to. A code is never renamed or moved to another class. */
export const ERROR_CODES = {
  "policy-failed": "policy",
  "invalid-argument": "usage",
  "invalid-config": "usage",
  "invalid-data-version": "usage",
  "unknown-command": "usage",
  "finding-not-found": "data",
  "finding-not-observed": "data",
  "data-unavailable": "data",
  "data-update-failed": "data",
  "invalid-purl": "parse",
  "invalid-agent-file": "parse",
  "invalid-sbom": "parse",
  "invalid-input": "parse",
  "scan-memory-exceeded": "internal",
  internal: "internal",
} as const satisfies Record<string, FailureClass>;
export type ErrorCode = keyof typeof ERROR_CODES;

/** The reason code a failure reports when its raiser names none: the least specific code of the class. */
export const DEFAULT_REASONS: Record<FailureClass, ErrorCode> = {
  policy: "policy-failed",
  usage: "invalid-argument",
  data: "data-unavailable",
  parse: "invalid-input",
  internal: "internal",
};

/** The failure class a reason code belongs to. */
export function failureClassOf(code: ErrorCode): FailureClass {
  return ERROR_CODES[code];
}

/** An error with a stable reason code. Domain errors extend it so no failure reaches a user without one. */
export class EvergreenError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "EvergreenError";
    this.code = code;
  }

  /** The failure class, and so the CLI exit code, this error maps to. */
  get kind(): FailureClass {
    return failureClassOf(this.code);
  }
}

/** The reason code and failure class of any thrown value; anything that is not an {@link EvergreenError} is `internal`. */
export function classifyError(error: unknown): {
  code: ErrorCode;
  kind: FailureClass;
} {
  if (error instanceof EvergreenError) return { code: error.code, kind: error.kind };
  return { code: "internal", kind: "internal" };
}
