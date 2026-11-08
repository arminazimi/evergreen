---
title: "Deprecated GitHub Actions ::set-output command — dates, impact, migration"
description: "GitHub deprecated the ::set-output workflow command. Append to the GITHUB_OUTPUT environment file instead."
layout: doc
permalink: "/rules/github-actions.workflow-command.set-output.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html"
image: "/assets/og/github-actions.workflow-command.set-output.svg"
review_date: "2026-11-05"
last_modified_at: "2026-11-05"
json_twin: "/rules/github-actions.workflow-command.set-output.json"
---

# Deprecated GitHub Actions ::set-output command

**Deprecated.** The source gives no day. Replacement: $GITHUB_OUTPUT. Source: [GitHub Actions: Deprecating save-state and set-output commands](https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/).

Check a version:

```bash
evergreen check pkg:generic/github-actions/set-output
```

GitHub deprecated the ::set-output workflow command. Append to the GITHUB_OUTPUT environment file instead.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `github-actions` |
| Component | `pkg:generic/github-actions/set-output` |
| Affected versions | `vers:semver/*` |
| Date from the source | The source gives no day |
| Replacement | $GITHUB_OUTPUT |
| Evidence last seen | 2026-11-05 |
| Reviewed | 2026-11-05 by arminazimi |
| Review due | 2027-11-05 (365 days after the last review) |
| Rule ID | `github-actions.workflow-command.set-output` |

## Sources

- [GitHub Actions: Deprecating save-state and set-output commands](https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/) (accessed 2026-11-05)

## Migration

**Constraints**

- Use environment files with a runner version supporting them. Multiline values require delimiter syntax.
- Preserve the effective shell and quote expansion; never copy encoded command values directly.

**Steps**

1. **Append to GITHUB_OUTPUT.** Replace literal single-line echo commands with the corresponding environment-file append to "$GITHUB_OUTPUT". Migrate complex values manually.

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

This page is generated from [`registry/github-actions.json`](https://github.com/arminazimi/evergreen/blob/main/registry/github-actions.json), rule `github-actions.workflow-command.set-output`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html",
      "headline": "Deprecated GitHub Actions ::set-output command — dates, impact, migration",
      "description": "GitHub deprecated the ::set-output workflow command. Append to the GITHUB_OUTPUT environment file instead.",
      "inLanguage": "en",
      "dateModified": "2026-11-05",
      "keywords": [
        "deprecated",
        "github-actions",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "Deprecated GitHub Actions ::set-output command",
        "identifier": "pkg:generic/github-actions/set-output"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "GitHub Actions: Deprecating save-state and set-output commands",
          "url": "https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/github-actions.workflow-command.set-output.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/github-actions/set-output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/*. Source: GitHub Actions: Deprecating save-state and set-output commands (https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/github-actions/set-output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "$GITHUB_OUTPUT"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/github-actions/set-output?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/github-actions/set-output."
          }
        }
      ]
    }
  ]
}
</script>
