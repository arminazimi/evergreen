---
title: "Unsupported softprops/action-gh-release runtime — dates, impact, migration"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.action-gh-release.node20.html"
json_twin: "/rules/github-actions.action-gh-release.node20.json"
---

# Unsupported softprops/action-gh-release runtime

**End of support** as of 2026-09-23. Replacement: softprops/action-gh-release@v3 or later. Source: [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

Check a version:

```bash
evergreen check pkg:github/softprops/action-gh-release
```

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/softprops/action-gh-release` |
| Affected versions | `vers:semver/<3.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | softprops/action-gh-release@v3 or later |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by claude-agent |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `github-actions.action-gh-release.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [softprops/action-gh-release v3.0.0 release notes](https://github.com/softprops/action-gh-release/releases/tag/v3.0.0)

## Migration

**Constraints**

- Preserve the release tag, name, notes, draft and prerelease flags, and the files to upload; the job still needs contents: write.

**Steps**

1. **Upgrade action-gh-release.** Change the uses reference to softprops/action-gh-release@v3 or a later supported major.
2. **Review action-gh-release inputs.** Compare configured inputs with the target release and update renamed or changed options; confirm the runner meets the release's minimum version.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.action-gh-release.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.action-gh-release.node20.html",
  "url": "https://arminazimi.github.io/evergreen/rules/github-actions.action-gh-release.node20.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.action-gh-release.node20.html",
  "headline": "Unsupported softprops/action-gh-release runtime — dates, impact, migration",
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
    "name": "Unsupported softprops/action-gh-release runtime",
    "identifier": "pkg:github/softprops/action-gh-release"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node 20 is no longer available in GitHub Actions",
      "url": "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/"
    },
    {
      "@type": "CreativeWork",
      "name": "softprops/action-gh-release v3.0.0 release notes",
      "url": "https://github.com/softprops/action-gh-release/releases/tag/v3.0.0"
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
