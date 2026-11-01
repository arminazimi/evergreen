---
title: Evergreen
description: Know what breaks next.
layout: home
---

Evergreen finds the runtimes, packages, and GitHub Actions in a repository that are already end-of-life or deprecated, shows the exact file and line, and backs every finding with an authoritative source, a replacement, and migration steps — locally, offline, and with no account.

```bash
npx evergreen-deprecation scan .
```

Node.js 22 or newer. [Install](INSTALL.md) covers npm, Docker, standalone binaries, and the GitHub Action; the [90-second demo](DEMO.md) runs this scan on a deliberately outdated project and reports five findings:

```text
Found 5 lifecycle risks. The most urgent:
  HIGH Unsupported actions/checkout runtime (.github/workflows/ci.yml:9)
  MEDIUM Node.js 18 is end-of-life (package.json:5)
  MEDIUM Node.js 19 is end-of-life (package.json:5)
  …and 2 more below.
```

## Try it

- [Five-step quickstart](QUICKSTART.md): from the first scan to a baseline in CI.
- [90-second demo](DEMO.md): a deliberately outdated project, scanned, explained, and turned into migration context.
- [CLI reference](CLI.md): every command, flag, shell completion, and exit code.
- [Playbook: manual CLI checks](playbooks/cli.md): scan, read, decide, accept, and keep findings from returning.
- [Runtime drift](DRIFT.md): every runtime version a repository states, and whether they agree.
- [Upgrade check](UPGRADE_CHECK.md): whether a project can move to a target runtime, with each blocker and its evidence.
- [Local MCP server](MCP.md): the tools and output schemas an agent can call.
- [Environment doctor and compatibility](COMPATIBILITY.md): supported ecosystems, hosts, and maturity.

## Set up CI

- [GitHub Action](GITHUB_ACTION.md): pull request comments, SARIF code scanning, and severity gates.
- [Playbook: GitHub Actions](playbooks/github.md): add the Action, read what it reports, and accept findings on purpose.
- [GitLab CI/CD component](GITLAB.md): the component, its permissions, and self-managed constraints.
- [Playbook: GitLab pipelines](playbooks/gitlab.md): gate merges on severity and accept known findings.
- [Organization rollout](ORG_ROLLOUT.md): scan every repository with one reusable workflow and a weekly digest.
- [Hooks](HOOKS.md): scan before every push, or block a deprecated package install in an agent.
- [Privacy](PRIVACY.md): what stays on your machine and the one command that uses the network.

## Use with agents

- [Agent Skill](AGENT_SKILLS.md): the portable skill for coding agents and how its triggering is evaluated.
- [Playbook: agent-driven migrations](playbooks/agent.md): migrate one finding while Evergreen supplies the facts and the proof.
- [Migration packets](MIGRATION_PACKETS.md): the structured context Evergreen builds for one finding.
- [Migration plans](PLAN.md): waves of independent migration tasks for parallel agent sessions.
- [Capability manifest](CAPABILITIES.md): how a tool or agent discovers what Evergreen can do.
- [Claude plugin](CLAUDE_PLUGIN.md): install Evergreen, its Skill, and the dependency guard in Claude Code.
- [Codex plugin](CODEX_PLUGIN.md): install Evergreen and the dependency guard in Codex.
- [Codex and Claude plugin packaging](PLUGIN_PACKAGING.md): how the plugins are built and published.
- [Cross-host plugin evaluation and security boundaries](PLUGIN_EVALS.md): what each host can and cannot enforce.

## Reference

- [Lifecycle rules](RULES.md): the rule format, the evidence policy, and how to write a rule.
- [Lifecycle data](DATA.md): signed data updates, pinning, offline guarantees, and the trust model.
- [Detector reference](detectors/index.md): one page per ecosystem, with what each detector reads and reports.
- [Detector SDK](DETECTORS.md): the public seam and how to start a new detector.
- [Lifecycle importers](IMPORTERS.md): drafting rules from authoritative sources for review.
- [Maintainer CLE declarations](MAINTAINERS.md): how installed packages declare their lifecycle.
- [Architecture and trust boundaries](ARCHITECTURE.md): the layers and what each one must not do.
- [Threat model](THREAT_MODEL.md): trust boundaries, threats, and residual risks.
- [Validation results](VALIDATION.md): the public corpus, precision thresholds, and measured results.
- [State of EOL](state-of-eol.md): corpus findings aggregated by product and release line.
- [Evergreen compared with Renovate, Dependabot, and endoflife.date](compare/index.md): what each tool answers, and where each is stronger.
- [Decision records](decisions/index.md): the decisions behind public contracts.
- [Roadmap](ROADMAP.md): phases and what each one delivers.
- [Post-launch notes and next roadmap](NEXT.md): what shipped after v0.1 and what comes next.
- [Changelog](CHANGELOG.md): every release, with a stable link per version.
- [Start contributing](CONTRIBUTE.md): pick a sized issue, follow its brief, and open one pull request.
- [Codex plugin submission](CODEX_SUBMISSION.md): how the plugin is submitted to the Codex directory.
- [Brand guide](https://github.com/arminazimi/evergreen/blob/main/brand/BRAND_GUIDE.md), [brand asset terms](https://github.com/arminazimi/evergreen/blob/main/brand/LICENSE.md), and the [distribution brand checklist](DISTRIBUTION_BRAND.md).
- [Support](SUPPORT.md) and [terms](TERMS.md).

[Source code](https://github.com/arminazimi/evergreen) · [Report an issue](https://github.com/arminazimi/evergreen/issues) · [npm package](https://www.npmjs.com/package/evergreen-deprecation)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Evergreen",
  "alternateName": "evergreen-deprecation",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Node.js 22 or newer",
  "description": "Local-first deprecation intelligence for software repositories. Finds end-of-life and deprecated runtimes, packages, and GitHub Actions at exact file locations, with sources and migration context.",
  "url": "https://arminazimi.github.io/evergreen/",
  "downloadUrl": "https://www.npmjs.com/package/evergreen-deprecation",
  "installUrl": "https://www.npmjs.com/package/evergreen-deprecation",
  "softwareHelp": "https://arminazimi.github.io/evergreen/QUICKSTART.html",
  "license": "https://github.com/arminazimi/evergreen/blob/main/LICENSE",
  "sameAs": [
    "https://github.com/arminazimi/evergreen",
    "https://www.npmjs.com/package/evergreen-deprecation"
  ],
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen/"
  }
}
</script>
