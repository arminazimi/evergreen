---
title: Evergreen
description: Know what breaks next.
layout: home
---

Evergreen is local-first deprecation intelligence for software repositories. It
discovers supported lifecycle risks, connects them to exact files and usages, and
produces evidence-backed migration context for humans and coding agents without a
hosted service.

## Start here

- [90-second demo](DEMO.md)
- [Start contributing](CONTRIBUTE.md)
- [v0.1 validation results](VALIDATION.md)
- [Environment doctor and compatibility matrix](COMPATIBILITY.md)
- [Capability manifest and auto-discovery contract](CAPABILITIES.md)
- [Lifecycle rules](RULES.md)
- [Maintainer CLE declarations](MAINTAINERS.md)
- [Lifecycle importers](IMPORTERS.md)
- [Migration packets](MIGRATION_PACKETS.md)
- [Local MCP server](MCP.md)
- [Agent Skill](AGENT_SKILLS.md)
- [Codex and Claude plugin packaging](PLUGIN_PACKAGING.md)
- [Codex plugin installation and management](CODEX_PLUGIN.md)
- [Claude plugin installation and distribution](CLAUDE_PLUGIN.md)
- [Codex plugin submission](CODEX_SUBMISSION.md)
- [Privacy](PRIVACY.md)
- [Support](SUPPORT.md)
- [Terms](TERMS.md)
- [Cross-host plugin evaluation and security boundaries](PLUGIN_EVALS.md)
- [GitHub Action](GITHUB_ACTION.md)
- [Detector SDK](DETECTORS.md)
- [Architecture and trust boundaries](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Post-launch notes and next roadmap](NEXT.md)
- [Brand guide](https://github.com/arminazimi/evergreen/blob/main/brand/BRAND_GUIDE.md)
- [Brand asset terms](https://github.com/arminazimi/evergreen/blob/main/brand/LICENSE.md)
- [Distribution brand checklist](DISTRIBUTION_BRAND.md)

## Install

```bash
npx evergreen-deprecation scan .
```

Shell completions: `source <(evergreen completions bash)`, `source <(evergreen completions zsh)`, or `evergreen completions fish | source`. `evergreen --help` lists one example per command.

Evergreen runs on Node.js 22 or newer. Repository analysis stays on the local machine or CI runner.

[Source code](https://github.com/arminazimi/evergreen) · [Report an issue](https://github.com/arminazimi/evergreen/issues) · [npm package](https://www.npmjs.com/package/evergreen-deprecation)
