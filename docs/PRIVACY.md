# Evergreen privacy

Evergreen analyzes software repositories on the user's computer. The Codex and Claude plugins start a local stdio MCP server and do not send repository contents to an Evergreen-operated service. Evergreen does not require an Evergreen account, collect analytics, use advertising identifiers, or sell personal data.

The local tools read supported manifests, lockfiles, workflow files, runtime-version files, and relevant source excerpts from the repository path the user authorizes. Results can contain file paths and short source excerpts. The host application receives those results, so its privacy policy and the user's workspace settings also apply.

The plugin launches the exact published `evergreen-deprecation` npm version recorded in its manifest. The package manager may contact the configured npm registry to obtain that package. Lifecycle evidence links are returned as references; Evergreen does not open them automatically.

Scans use no network. The one exception is `evergreen data update`, which you run yourself to fetch newer, signed lifecycle rules from the project's public GitHub releases. It sends nothing about you or your repository (a request for a public release list and two public files, which the host can see as it can any download), verifies the signature before using the data, and falls back to the rules shipped with the release if verification fails. See [Lifecycle data](DATA.md).

## Local usage log

By default Evergreen records nothing about what you or an agent checked. If you set `EVERGREEN_USAGE_LOG=1` (or to a file path), each `evergreen check` and each `check_dependency` call appends one line to a file on your machine: the time, the package URL and version checked, the result, its severity, and the matching rule IDs. It records no repository path, file content, user name, or prompt. `evergreen usage` reads that file and prints how many checks ran and which packages were flagged as `affected` (what the guardrail told an agent to avoid; Evergreen cannot itself stop an edit). **Nothing in this log is sent anywhere: Evergreen has no code that uploads it, and the summary command reads only the local file.** Delete the file to erase it; unset the variable to stop recording. Because the file lives on disk, anything that can read your files can read it.

Evergreen's tools do not edit repository files, execute suggested migration commands, open a network listener, or request credentials. Users can disable or remove the plugin at any time. Questions can be reported through [GitHub Issues](https://github.com/arminazimi/evergreen/issues).
