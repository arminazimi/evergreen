---
title: Evergreen, Slipway, and Seaworthy
---

# Evergreen, Slipway, and Seaworthy

Three tools share the work on a [Slipway](https://github.com/arminazimi/slipway)-shaped Jekyll site for GitHub Pages. Each one owns a different question. Use them in order so an agent (or a human) does not mix lifecycle evidence with site verification.

| Tool | Owns | Maturity |
| --- | --- | --- |
| **Evergreen** | Whether a gem, npm package, GitHub Action, or runtime line is deprecated or end-of-life, with evidence | Shipped (`evergreen-deprecation` on npm) |
| **Slipway** | The Jekyll theme, layout, and Pages-oriented site stack | In planning and dogfooding; use only what its repository documents |
| **Seaworthy** | Whether the **built** site is healthy (links, agent-readable structure) | Pre-alpha; **not on npm yet** — commands below are for when its first release ships |

Evergreen and Seaworthy both run locally against files on disk. Neither sends your repository to a cloud service during a check or verify.

## The agent loop

Work in this order when you change dependencies or site content.

### 1. Before adding a gem, package, or Action

Check the dependency with Evergreen **before** you edit `Gemfile`, `package.json`, or workflow `uses:` pins.

```bash
npx evergreen-deprecation check pkg:rubygems/jekyll@4.3.4
npx evergreen-deprecation check pkg:npm/typescript@5.4.5
npx evergreen-deprecation check pkg:github/actions/checkout@v4
```

Or, if the CLI is on your `PATH` as `evergreen`:

```bash
evergreen check pkg:rubygems/jekyll@4.3.4
```

- If the result is `affected`, prefer the replacement Evergreen names and cite its evidence links. Do not add the dependency without telling the user why.
- `version-dependent` means the answer depends on the version — call again with the version you intend to lock.
- `no-data` means Evergreen has no rule for that package; it is **not** a claim that the package is safe.

For Ruby gems on a Pages site, also keep an eye on the Ruby runtime line (`.ruby-version`, `Gemfile`, `Gemfile.lock`) — GitHub Pages builds with a fixed Ruby line that must still receive fixes.

### 2. Edit pages and configuration

Change Markdown, `_config.yml`, layouts, and workflows as the task requires. Slipway-specific behavior follows the Slipway repository and starter; do not assume features that are not documented there.

Copy the Evergreen CI starter when the site has no lifecycle gate yet: [examples/starters/slipway/](../examples/starters/slipway/).

### 3. After the site builds

When `_site/` exists from `bundle exec jekyll build` (or your CI build step), verify the output with Seaworthy:

```bash
# Pending Seaworthy's first npm release — not installable yet.
seaworthy verify ./_site
```

Until Seaworthy publishes, treat this step as documentation-only. Do not fail a task because the command is unavailable.

## Which output to trust for what

| Question | Trust | Do not use |
| --- | --- | --- |
| Is this gem, package, or Action deprecated or end-of-life? | Evergreen `check` (or repository `scan`) — lifecycle rules with sources | Seaworthy |
| Are links broken or pages hard for agents to read on the built site? | Seaworthy `verify` (once released) | Evergreen |
| What is already declared in this repo? | Evergreen `scan` on the tree — findings at exact paths | A single `check` for everything |

Evergreen answers **lifecycle** questions with reviewed rules. Seaworthy answers **site quality** questions on static HTML. A clean Evergreen scan does not mean the site links work; a passing Seaworthy run does not mean a new gem is safe to add.

## Wire this into your agent

Copy [examples/agents/site-stack/AGENTS.md](../examples/agents/site-stack/AGENTS.md) into the site repository (merge with your existing `AGENTS.md` if you already have one). It repeats the loop in imperative form for coding agents.

Related:

- [Evergreen for your agent](AGENTS_SETUP.md) — MCP, hooks, and host-specific setup
- [Slipway starter kit](../examples/starters/slipway/) — `.evergreen.json` and a pull-request workflow
- [Dependency check snippet](../examples/agents/dependency-check.md) — short guardrail text you can paste anywhere
