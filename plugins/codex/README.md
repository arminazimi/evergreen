# Evergreen for Codex

Evergreen finds, explains, and verifies supported software lifecycle risks in local repositories. The plugin combines the canonical Evergreen Skill with a read-only local MCP server and requires no Evergreen account.

Repository analysis runs on the user's computer. Evergreen does not upload repository contents, execute migration commands, edit files, or open a network listener. The host still controls filesystem access, approvals, and any later edits an agent makes.

## Install

From the Evergreen repository, run:

```sh
codex plugin add evergreen@evergreen-codex
```

Node.js 22 or newer is required. See the [Codex installation and management guide](https://arminazimi.github.io/evergreen/CODEX_PLUGIN.html) for installation, updates, validation, privacy boundaries, and removal.
