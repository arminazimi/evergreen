# Aider

Requires Node.js 22 or newer.

1. Copy [`CONVENTIONS.md`](CONVENTIONS.md) to your project root.
2. Load it in every session by merging the `read` entry from [`.aider.conf.yml`](.aider.conf.yml) into your own `.aider.conf.yml` (or creating that file with it), or load it once with `aider --read CONVENTIONS.md` inside a session or `/read CONVENTIONS.md` in the chat. A file loaded this way is marked read-only and is not rewritten by aider edits.
3. Start a new aider session so the conventions are in the chat.

Aider does not support MCP servers, so the guardrail runs on the CLI: the conventions tell the agent to run `npx evergreen-deprecation check <purl>` before it adds a package and to prefer the replacement the result names.

## Verification status

The conventions file name and the `read` key follow the vendor documentation read on 2026-10-27 (linked below). Two things are checked, one is not:

- **Checked (2026-10-27):** the command the conventions recommend was run from the published npm package, `npx -y --package evergreen-deprecation@0.7.1 evergreen check pkg:npm/request@2.88.2`, with no MCP server involved. It reported `pkg:npm/request` as `affected` (high severity): `request` is fully deprecated with no new changes expected, replacement `Native fetch or a maintained HTTP client`, citing the npm package page as its source.
- **Not checked:** this setup has **not** been run inside a live installation of Aider. Before relying on it, run the check below and record the aider version here in a pull request.

To verify: start aider in a project that has this setup, ask it to `Add the request package to this project`, and confirm it runs `npx evergreen-deprecation check pkg:npm/request` and reports the deprecation with its replacement and sources.

Documentation: [Aider conventions](https://aider.chat/docs/usage/conventions.html), [Aider config](https://aider.chat/docs/config/aider_conf.html).
