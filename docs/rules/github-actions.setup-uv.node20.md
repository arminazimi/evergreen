---
title: "Unsupported astral-sh/setup-uv runtime — dates, impact, migration"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.setup-uv.node20.html"
---

# Unsupported astral-sh/setup-uv runtime

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/astral-sh/setup-uv` |
| Affected versions | `vers:semver/<7.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | astral-sh/setup-uv@v7 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.setup-uv.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [astral-sh/setup-uv v7.0.0 release notes](https://github.com/astral-sh/setup-uv/releases/tag/v7.0.0)

## Migration

**Constraints**

- Preserve the uv version, Python version, and cache inputs; v7 is a breaking release, so read its notes before upgrading self-hosted runners.

**Steps**

1. **Upgrade setup-uv.** Change the uses reference to astral-sh/setup-uv@v7 or a later supported major.
2. **Review setup-uv inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.setup-uv.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-uv.node20.html",
  "url": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-uv.node20.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-uv.node20.html",
  "headline": "Unsupported astral-sh/setup-uv runtime — dates, impact, migration",
  "description": "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "end-of-support",
    "github-actions",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Unsupported astral-sh/setup-uv runtime",
    "identifier": "pkg:github/astral-sh/setup-uv"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node 20 is no longer available in GitHub Actions",
      "url": "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/"
    },
    {
      "@type": "CreativeWork",
      "name": "astral-sh/setup-uv v7.0.0 release notes",
      "url": "https://github.com/astral-sh/setup-uv/releases/tag/v7.0.0"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
