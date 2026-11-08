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

/**
 * One agent host, in its own file under `hosts/`. The registry discovers every `hosts/<id>.ts` module that exports
 * `hostHook`, so adding a host means adding files, never editing a shared list.
 */
export interface HostHook {
  /** Serves `evergreen hook <id>`; `id` must equal the module's file name. */
  adapter: HostAdapter;
  /** Writes (or, with `dryRun`, previews) the host's configuration for `evergreen init --hooks-for <id>`; returns the text to print. */
  setup(options: { root: string; dryRun: boolean }): Promise<string>;
}
