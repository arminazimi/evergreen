---
title: "Unsupported actions/checkout runtime — dates, impact, migration"
description: "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners."
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.checkout.node20.html"
json_twin: "/rules/github-actions.checkout.node20.json"
---

# Unsupported actions/checkout runtime

**End of support** as of 2026-09-23. Replacement: actions/checkout@v5 or later. Source: [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

Check a version:

```bash
evergreen check pkg:github/actions/checkout
```

This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:github/actions/checkout` |
| Affected versions | `vers:semver/<5.0.0` |
| Date from the source | 2026-09-23 |
| Replacement | actions/checkout@v5 or later |
| Evidence last seen | 2026-10-13 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `github-actions.checkout.node20` |

## Sources

- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [actions/checkout runtime guidance](https://github.com/actions/checkout#checkout-v5)

## Migration

**Constraints**

- Preserve checkout depth, credentials, submodule, and sparse-checkout behavior configured through action inputs.

**Steps**

1. **Upgrade the checkout action.** Change the uses reference to actions/checkout@v5 or a later supported major.
2. **Review checkout inputs.** Compare configured inputs with the target release and update renamed or changed options.

**Verification**

- `git diff --check`: Validate the edited workflow diff.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.checkout.node20`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.checkout.node20.html",
  "url": "https://arminazimi.github.io/evergreen/rules/github-actions.checkout.node20.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.checkout.node20.html",
  "headline": "Unsupported actions/checkout runtime — dates, impact, migration",
  "description": "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.",
  "inLanguage": "en",
  "dateModified": "2026-10-14",
  "keywords": [
    "end-of-support",
    "github-actions",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Unsupported actions/checkout runtime",
    "identifier": "pkg:github/actions/checkout"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Node 20 is no longer available in GitHub Actions",
      "url": "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/"
    },
    {
      "@type": "CreativeWork",
      "name": "actions/checkout runtime guidance",
      "url": "https://github.com/actions/checkout#checkout-v5"
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
