---
title: "Retired actions/download-artifact release — dates, impact, migration"
description: "This release uses a retired artifact service or JavaScript runtime. Version 7 runs on Node.js 24."
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html"
json_twin: "/rules/github-actions.download-artifact.retired.json"
---

# Retired actions/download-artifact release

**Removed** as of 2026-09-23. Replacement: actions/download-artifact@v7 or later. Source: [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

Check a version:

```bash
evergreen check pkg:github/actions/download-artifact
```

This release uses a retired artifact service or JavaScript runtime. Version 7 runs on Node.js 24.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | critical |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/download-artifact` |
| Affected versions | `vers:semver/<7.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/download-artifact@v7 or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `github-actions.download-artifact.retired` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [Deprecation notice for artifact actions v3](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)

## Migration

**Constraints**

- Preserve artifact selection, download paths, merge behavior, and downstream file locations.

**Steps**

1. **Upgrade download-artifact.** Change the uses reference to actions/download-artifact@v7 or a later supported major.
2. **Review downloaded layout.** Confirm artifact filters, paths, merge-multiple behavior, and downstream consumers against the target release.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.download-artifact.retired`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html",
      "headline": "Retired actions/download-artifact release — dates, impact, migration",
      "description": "This release uses a retired artifact service or JavaScript runtime. Version 7 runs on Node.js 24.",
      "inLanguage": "en",
      "dateModified": "2026-10-14",
      "keywords": [
        "removed",
        "github-actions",
        "critical"
      ],
      "about": {
        "@type": "Thing",
        "name": "Retired actions/download-artifact release",
        "identifier": "pkg:github/actions/download-artifact"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Node 20 is no longer available in GitHub Actions",
          "url": "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/"
        },
        {
          "@type": "CreativeWork",
          "name": "Deprecation notice for artifact actions v3",
          "url": "https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.download-artifact.retired.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:github/actions/download-artifact?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed as of 2026-09-23. Affected versions: vers:semver/\u003c7.0.0. Source: Node 20 is no longer available in GitHub Actions (https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:github/actions/download-artifact?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "actions/download-artifact@v7 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:github/actions/download-artifact?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:github/actions/download-artifact."
          }
        }
      ]
    }
  ]
}
</script>
