# Evergreen for Codex

Evergreen finds, explains, and verifies supported software lifecycle risks in local repositories. The plugin combines the canonical Evergreen Skill with a read-only local MCP server and requires no Evergreen account.

Repository analysis runs on the user's computer. Evergreen does not upload repository contents, execute migration commands, edit files, or open a network listener. The host still controls filesystem access, approvals, and any later edits an agent makes.

Node.js 22 or newer is required. See the [Codex submission and installation guide](https://arminazimi.github.io/evergreen/CODEX_SUBMISSION.html) for setup, privacy boundaries, review cases, and removal.
