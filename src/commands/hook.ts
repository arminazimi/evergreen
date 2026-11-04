import { runHook } from "../agent-hooks/command.js";
import type { CliCommand } from "./types.js";

/** `hook`: answers one agent host's post-edit hook in that host's own protocol. */
export const command: CliCommand = {
  name: "hook",
  flags: ["--fail-on"],
  example: "evergreen hook claude-code",
  usage: [
    "  evergreen hook <host> [--fail-on <severity|none>]   # check the file an agent just wrote and answer in its hook protocol",
  ],
  async run(args) {
    return runHook(args);
  },
};
