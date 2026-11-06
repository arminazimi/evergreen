import type { ActionableMessage } from "../errors.js";

/**
 * The stable failure classes. `policy` (1) and `usage` (2) keep the exit codes Evergreen has always used; the rest are
 * distinct so a caller can branch on the exit code alone. Documented in docs/CAPABILITIES.md.
 */
export const EXIT_CODES = { policy: 1, usage: 2, data: 3, parse: 4, internal: 5 } as const;
export type FailureClass = keyof typeof EXIT_CODES;

/** Shared helpers a command handler needs. Command files take this instead of importing the CLI entry. */
export interface CommandContext {
  readonly jsonErrors: boolean;
  readonly debug: boolean;
  /** Full `--help` text, for usage errors that append it. */
  readonly help: string;
  readonly exitCodes: typeof EXIT_CODES;
  /** The shell completion script for `shell`, or undefined when the shell is unknown. Supplied by the CLI entry. */
  completionScript(shell: string | undefined): string | undefined;
  fail(kind: FailureClass, message: string, appendix?: string): number;
  failActionable(kind: FailureClass, actionable: ActionableMessage): number;
}

export interface CliCommand {
  readonly name: string;
  /** Flags offered by shell completions after the command name. */
  readonly flags: readonly string[];
  /** One runnable example line shown under Examples: in --help. */
  readonly example: string;
  /** Full usage lines for --help (exactly the current HELP lines for that command, including leading spaces / wording). */
  readonly usage: readonly string[];
  /**
   * Index of each `usage` line in the historical Usage block. Lines without a slot are appended, so a new command
   * does not need to edit this layout to show up in `--help`.
   */
  readonly usageSlots?: readonly number[];
  /** Optional completion extras (subcommands for data/watch/completions). */
  readonly completion?: {
    readonly subcommands?: readonly string[];
    readonly extraWords?: readonly string[];
  };
  run(args: string[], ctx: CommandContext): Promise<number>;
}
