/**
 * Actionable CLI failures: a one-line cause plus a next step. Stack traces stay behind `--debug`.
 */

/** Evergreen's engines.node major; keep in sync with package.json. */
export const REQUIRED_NODE_MAJOR = 22;

/** One-line cause for stderr/JSON, and a next step printed only on stderr. */
export interface ActionableMessage {
  cause: string;
  nextStep: string;
}

/** Splits an actionable failure into the `fail()` message and its stderr appendix. */
export function renderActionable(message: ActionableMessage): { message: string; appendix: string } {
  return { message: message.cause, appendix: `Next: ${message.nextStep}\n` };
}

/** When the running Node.js is too old; undefined when the version is fine. */
export function unsupportedNodeVersion(version = process.versions.node): ActionableMessage | undefined {
  const major = Number.parseInt(version, 10);
  if (!Number.isFinite(major) || major >= REQUIRED_NODE_MAJOR) return undefined;
  return {
    cause: `Unsupported Node.js version: ${version} (Evergreen needs Node.js ${REQUIRED_NODE_MAJOR} or newer).`,
    nextStep: `Install Node.js ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org and run the command again.`,
  };
}

/** A scan (or similar) path that cannot be used as a repository root. */
export function unreadablePath(path: string, problem: "missing" | "not-directory" | "unreadable"): ActionableMessage {
  if (problem === "missing") {
    return {
      cause: `Path does not exist: ${path}`,
      nextStep: "Pass an existing directory, or run the command from inside the repository.",
    };
  }
  if (problem === "not-directory") {
    return {
      cause: `Not a directory: ${path}`,
      nextStep: "Pass a repository directory, not a file.",
    };
  }
  return {
    cause: `Cannot read path: ${path}`,
    nextStep: "Check permissions on that path, then retry.",
  };
}

/** A baseline or other local config file that is missing fields or is not valid JSON. */
export function invalidConfig(detail: string): ActionableMessage {
  return {
    cause: detail,
    nextStep: "Fix the file so it is valid JSON with schemaVersion \"evergreen.baseline.v1\", or omit --baseline.",
  };
}

/** True when a data-update failure looks like the network was unreachable. */
export function isOfflineDataUpdateFailure(detail: string): boolean {
  return /Could not download|fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ECONNRESET|ETIMEDOUT|network|UND_ERR|AbortError|other side closed|socket hang up/i.test(detail);
}

/** A `data update` that could not reach the release list or bundle. */
export function offlineDataUpdate(detail: string): ActionableMessage {
  return {
    cause: detail,
    nextStep: "Connect to the network and retry `evergreen data update`, or keep using the bundled data without updating.",
  };
}

/** Unexpected internal failure; with `--debug`, append the stack to the stderr appendix. */
export function unexpectedFailure(error: unknown, debug: boolean): { message: string; appendix: string } {
  const err = error instanceof Error ? error : new Error(String(error));
  const nextStep = debug
    ? "If this looks like a bug, open an issue with the stack trace above."
    : "Re-run with --debug to see the stack trace, then open an issue if it persists.";
  const stack = debug && err.stack ? `${err.stack}\n` : "";
  return {
    message: `Evergreen failed unexpectedly: ${err.message}`,
    appendix: `Next: ${nextStep}\n${stack}`,
  };
}
