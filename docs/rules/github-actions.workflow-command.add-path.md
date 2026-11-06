---
title: "Removed GitHub Actions ::add-path command — dates, impact, migration"
description: "GitHub removed the ::add-path workflow command. Append to the GITHUB_PATH environment file instead."
layout: doc
permalink: "/rules/github-actions.workflow-command.add-path.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html"
image: "/assets/og/github-actions.workflow-command.add-path.svg"
review_date: "2026-11-05"
last_modified_at: "2026-11-05"
json_twin: "/rules/github-actions.workflow-command.add-path.json"
---

# Removed GitHub Actions ::add-path command

**Removed** as of 2020-11-16. Replacement: $GITHUB_PATH. Source: [GitHub Actions: Removing set-env and add-path commands on November 16](https://github.blog/changelog/2020-11-09-github-actions-removing-set-env-and-add-path-commands-on-november-16/).

Check a version:

```bash
evergreen check pkg:generic/github-actions/add-path
```

GitHub removed the ::add-path workflow command. Append to the GITHUB_PATH environment file instead.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `github-actions` |
| Component | `pkg:generic/github-actions/add-path` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2020-11-16 |
| Replacement | $GITHUB_PATH |
| Evidence last seen | 2026-11-05 |
| Reviewed | 2026-11-05 by arminazimi |
| Review due | 2027-11-05 (365 days after the last review) |
| Rule ID | `github-actions.workflow-command.add-path` |

## Sources

- [GitHub Actions: Removing set-env and add-path commands on November 16](https://github.blog/changelog/2020-11-09-github-actions-removing-set-env-and-add-path-commands-on-november-16/) (accessed 2026-11-05)

## Migration

**Constraints**

- Use environment files with a runner version supporting them. Multiline values require delimiter syntax.
- Preserve the effective shell and quote expansion; never copy encoded command values directly.

**Steps**

1. **Append to GITHUB_PATH.** Replace literal single-line echo commands with the corresponding environment-file append to "$GITHUB_PATH". Migrate complex values manually.

**Verification**

- `git diff --check`: Review the workflow patch before running it.

## Detected by

The `github-actions` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [Unsupported softprops/action-gh-release runtime](github-actions.action-gh-release.node20.html)
- [Unsupported docker/bake-action runtime](github-actions.bake-action.node20.html)
- [Unsupported docker/build-push-action runtime](github-actions.build-push-action.node20.html)
- [Unsupported actions/cache runtime](github-actions.cache.node20.html)
- [Unsupported actions/checkout runtime](github-actions.checkout.node20.html)
- [Unsupported actions/configure-pages runtime](github-actions.configure-pages.node20.html)
- [Unsupported actions/create-github-app-token runtime](github-actions.create-github-app-token.node20.html)
- [Unsupported actions/deploy-pages runtime](github-actions.deploy-pages.node20.html)


## Data

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.workflow-command.add-path`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html",
      "headline": "Removed GitHub Actions ::add-path command — dates, impact, migration",
      "description": "GitHub removed the ::add-path workflow command. Append to the GITHUB_PATH environment file instead.",
      "inLanguage": "en",
      "dateModified": "2026-11-05",
      "keywords": [
        "removed",
        "github-actions",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Removed GitHub Actions ::add-path command",
        "identifier": "pkg:generic/github-actions/add-path"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "GitHub Actions: Removing set-env and add-path commands on November 16",
          "url": "https://github.blog/changelog/2020-11-09-github-actions-removing-set-env-and-add-path-commands-on-november-16/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.add-path.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/github-actions/add-path?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed as of 2020-11-16. Affected versions: vers:semver/*. Source: GitHub Actions: Removing set-env and add-path commands on November 16 (https://github.blog/changelog/2020-11-09-github-actions-removing-set-env-and-add-path-commands-on-november-16/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/github-actions/add-path?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "$GITHUB_PATH"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/github-actions/add-path?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/github-actions/add-path."
          }
        }
      ]
    }
  ]
}
</script>
