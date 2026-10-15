# Codex plugin installation and management

Evergreen ships as a portable Agent Plugins package with a Codex compatibility manifest. It bundles the canonical Evergreen Skill and a local, read-only stdio MCP server. No Evergreen account or hosted Evergreen service is required.

## Requirements

- Codex CLI or Codex in the ChatGPT desktop app with plugin support.
- Node.js 22 or newer.
- Access to the npm registry the first time the pinned Evergreen runtime is launched.

## Install from this repository

The repository marketplace is discovered from `.agents/plugins/marketplace.json` and exposes the package as `evergreen@evergreen-codex`:

```sh
codex plugin add evergreen@evergreen-codex
```

For a remote checkout, add or refresh the repository marketplace first:

```sh
codex plugin marketplace add arminazimi/evergreen --ref main
codex plugin add evergreen@evergreen-codex
```

Restart the current Codex session after installation so the packaged Skill and MCP server are discovered together.

## Verify the installation

List the installed plugin:

```sh
codex plugin list --json
```

Then ask Codex to run the packaged workflow:

```text
Scan this repository for supported lifecycle risks.
Explain the highest-severity Evergreen finding.
Create migration context for this deprecation.
Verify that the finding is gone after my change.
```

The installed workflow must expose scan, list, explain, context, and verify. Suggested migration commands are returned as guidance and are never executed by Evergreen.

Maintainers can run the same end-to-end check against an installed cache path:

```sh
npm run validate:codex-plugin -- --plugin-root /absolute/path/to/installed/evergreen
```

## Update

For the repo-local marketplace, reinstall the plugin so the cache is rebuilt from the current package:

```sh
codex plugin remove evergreen@evergreen-codex
codex plugin add evergreen@evergreen-codex
```

For a Git-backed marketplace added from `arminazimi/evergreen`, refresh its snapshot before reinstalling:

```sh
codex plugin marketplace upgrade evergreen-codex
```

The package pins its MCP runtime to the same semantic version as the plugin manifest, preventing a silent mix of plugin metadata and runtime versions.

## Remove

```sh
codex plugin remove evergreen@evergreen-codex
```

If the repository marketplace was added explicitly and is no longer needed:

```sh
codex plugin marketplace remove evergreen-codex
```

Removal deletes the installed plugin cache. It does not modify the repository being scanned.

## Local data and permissions

- The MCP process runs locally over stdio and reads only repository paths authorized by the host.
- Evergreen does not upload repository contents, require credentials, edit files, run migration commands, or open a network listener.
- Tool results can contain repository paths and short source excerpts and are returned to the Codex host.
- The host remains responsible for filesystem approvals and any later edits an agent makes.

See [Privacy](PRIVACY.md) for the complete data boundary and [Codex submission](CODEX_SUBMISSION.md) for public-directory review status.
