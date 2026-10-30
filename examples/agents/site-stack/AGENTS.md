# Slipway site stack (Evergreen + Seaworthy)

You are editing a Jekyll site that builds for GitHub Pages, often with the Slipway theme. Follow this loop so lifecycle checks and site verification stay separate.

## Before adding a dependency

Before you add or upgrade a **gem**, **npm package**, **GitHub Action**, or **runtime pin**, check it with Evergreen:

```bash
npx evergreen-deprecation check <purl>
```

Examples:

```bash
npx evergreen-deprecation check pkg:rubygems/jekyll@4.3.4
npx evergreen-deprecation check pkg:github/actions/configure-pages@v5
```

With the CLI on `PATH`, `evergreen check <purl>` is equivalent.

- If the status is `affected`, do not add the dependency silently. Prefer the replacement Evergreen cites and show the user the evidence links.
- `no-data` is not a safety claim — it only means Evergreen has no rule for that package.

Do not use Evergreen to audit CVEs or to bump packages the project already uses without a lifecycle reason.

## While editing the repository

When the task touches manifests, lockfiles, or `.github/workflows/`, run a repository scan before you finish:

```bash
npx evergreen-deprecation scan . --fail-on high
```

Fix or escalate any `high` or `critical` finding you introduced. Respect `.evergreen.json` ignore paths (`_site/`, `vendor/`, and similar generated output).

## After the site builds

When `_site/` exists from a local or CI build, verify it with Seaworthy:

```bash
# Pending Seaworthy's first npm release — not installable yet.
seaworthy verify ./_site
```

Seaworthy is pre-alpha and not on npm today. Document the intent; do not treat a missing CLI as a task failure until the project publishes an install path.

Trust Evergreen for **dependency lifecycle**. Trust Seaworthy (once released) for **built-site** link and readability checks. Do not substitute one for the other.
