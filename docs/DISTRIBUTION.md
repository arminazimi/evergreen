---
title: Distribution status
---

# Distribution status

Where Evergreen is published, and where it is not. Install steps for working channels are in [Install](INSTALL.md); brand checks for each surface are in [Distribution brand checklist](DISTRIBUTION_BRAND.md). Status below was reviewed on 2026-10-29 against the public listings; a scan never uses these links.

| Channel | Status | Link |
| --- | --- | --- |
| npm | Published (`evergreen-deprecation@0.7.1`) | [npmjs.com/package/evergreen-deprecation](https://www.npmjs.com/package/evergreen-deprecation) |
| Docker | Published (`ghcr.io/arminazimi/evergreen`) | [Package](https://github.com/arminazimi/evergreen/pkgs/container/evergreen) · [Install](INSTALL.md#run-the-quickstart-with-docker) |
| Homebrew | Published (`arminazimi/tap/evergreen`; formula may lag the npm release) | [Tap](https://github.com/arminazimi/homebrew-tap) · `brew install arminazimi/tap/evergreen` |
| MCP Registry | Listed (`io.github.arminazimi/evergreen`) | [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/v0/servers?search=evergreen) · [MCP](MCP.md#where-the-server-is-listed) |
| Skills | Listed (`arminazimi/evergreen@evergreen-deprecation`) | [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation) · [Agent Skill](AGENT_SKILLS.md) |
| Claude | Available from the repository marketplace | [Claude plugin](CLAUDE_PLUGIN.md) · `claude plugin install evergreen --marketplace arminazimi/evergreen` |
| Codex | Available from the repository marketplace; not in OpenAI's public plugin directory yet | [Codex plugin](CODEX_PLUGIN.md) · [Submission](CODEX_SUBMISSION.md) |
| GitHub | Published (Action and Marketplace) | [`arminazimi/evergreen`](https://github.com/arminazimi/evergreen) · [Marketplace](https://github.com/marketplace/actions/evergreen-lifecycle-intelligence) · [Action guide](GITHUB_ACTION.md) |
| GitLab | Published (CI/CD Catalog component) | [Catalog](https://gitlab.com/explore/catalog/arminazimi/evergreen) · [GitLab](GITLAB.md) |
| VS Code | Source shipped; not on the Visual Studio Marketplace or Open VSX | [`extensions/vscode`](https://github.com/arminazimi/evergreen/tree/main/extensions/vscode) |

Keeping a channel current after a release is part of [Releasing](RELEASING.md). Adoption counts for the public ones are measured only from public sources; see [Measuring adoption](ADOPTION.md).
