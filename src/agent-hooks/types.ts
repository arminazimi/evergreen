import type { Finding } from "../domain.js";

/** What a host's hook payload says the agent just changed. */
export interface HookEdit {
  /** Absolute repository root the host runs in. */
  root: string;
  /** Repository-relative paths, forward slashes, of the files the agent wrote or edited. */
  files: string[];
}

/** What the hook prints and how it exits, in the host's own protocol. */
export interface HookResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Translates one agent host's hook protocol. Owns no lifecycle logic. */
export interface HostAdapter {
  /** Host id used on the command line: `evergreen hook <id>`. */
  id: string;
  /** Reads the host's JSON payload. Returns undefined when the event is not a file write or edit. */
  parse(payload: unknown, env: NodeJS.ProcessEnv): HookEdit | undefined;
  /** Builds the response that shows `findings` to the agent; an empty list must let the agent continue silently. */
  respond(findings: readonly Finding[]): HookResponse;
}
