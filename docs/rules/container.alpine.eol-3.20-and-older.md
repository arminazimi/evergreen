---
title: "Alpine Linux image release lines 3.20 and older are end-of-life — dates, impact, migration"
description: "These Alpine Linux releases no longer receive security updates from the vendor."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html"
json_twin: "/rules/container.alpine.eol-3.20-and-older.json"
---

# Alpine Linux image release lines 3.20 and older are end-of-life

**End of life** as of 2026-04-01. Replacement: An alpine image on a supported release line. Source: [Alpine Linux releases](https://alpinelinux.org/releases/).

Check a version:

```bash
evergreen check pkg:docker/library/alpine
```

These Alpine Linux releases no longer receive security updates from the vendor.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/alpine` |
| Affected versions | `vers:semver/<3.21.0` |
| Date from the source | 2026-04-01 |
| Replacement | An alpine image on a supported release line |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-10-26 (365 days after the last review) |
| Rule ID | `container.alpine.eol-3.20-and-older` |

## Sources

- [Alpine Linux releases](https://alpinelinux.org/releases/)

## Migration

**Constraints**

- Keep the base image and deployment manifests that use alpine on one supported Alpine release line.
- Confirm the application and its dependencies work on the target Alpine release.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.alpine.eol-3.20-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html",
      "headline": "Alpine Linux image release lines 3.20 and older are end-of-life — dates, impact, migration",
      "description": "These Alpine Linux releases no longer receive security updates from the vendor.",
      "inLanguage": "en",
      "dateModified": "2026-10-26",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Alpine Linux image release lines 3.20 and older are end-of-life",
        "identifier": "pkg:docker/library/alpine"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Alpine Linux releases",
          "url": "https://alpinelinux.org/releases/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.alpine.eol-3.20-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-04-01. Affected versions: vers:semver/\u003c3.21.0. Source: Alpine Linux releases (https://alpinelinux.org/releases/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An alpine image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/alpine?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/alpine."
          }
        }
      ]
    }
  ]
}
</script>
