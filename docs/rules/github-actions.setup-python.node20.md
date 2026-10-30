---
title: "Unsupported actions/setup-python runtime — dates, impact, migration"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.setup-python.node20.html"
---

# Unsupported actions/setup-python runtime

**End of support** as of 2026-09-23. Replacement: actions/setup-python@v6 or later. Source: [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

Check a version:

```bash
evergreen check pkg:github/actions/setup-python
```

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/setup-python` |
| Affected versions | `vers:semver/<6.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/setup-python@v6 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.setup-python.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/setup-python v6.0.0 release notes](https://github.com/actions/setup-python/releases/tag/v6.0.0)

## Migration

**Constraints**

- Preserve the requested Python version, caching, and architecture inputs when upgrading.

**Steps**

1. **Upgrade setup-python.** Change the uses reference to actions/setup-python@v6 or a later supported major.
2. **Review setup-python inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.setup-python.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-python.node20.html",
  "url": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-python.node20.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.setup-python.node20.html",
  "headline": "Unsupported actions/setup-python runtime — dates, impact, migration",
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
    "name": "Unsupported actions/setup-python runtime",
    "identifier": "pkg:github/actions/setup-python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node 20 is no longer available in GitHub Actions",
      "url": "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/"
    },
    {
      "@type": "CreativeWork",
      "name": "actions/setup-python v6.0.0 release notes",
      "url": "https://github.com/actions/setup-python/releases/tag/v6.0.0"
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
