---
title: "Couchbase Server image release lines 7.2 and older are end-of-life — dates, impact, migration"
description: "These Couchbase Server release lines are past their end-of-life date in the vendor's lifecycle schedule (7.2 reached end of life in July 2026; 7.6 is supported until March 2027)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html"
json_twin: "/rules/container.couchbase.eol-7.2-and-older.json"
---

# Couchbase Server image release lines 7.2 and older are end-of-life

**End of life** as of 2026-07-31. Replacement: A couchbase image on a supported release line. Source: [Couchbase software lifecycle schedules](https://www.couchbase.com/support-policy/EOL/).

Check a version:

```bash
evergreen check pkg:docker/library/couchbase
```

These Couchbase Server release lines are past their end-of-life date in the vendor's lifecycle schedule (7.2 reached end of life in July 2026; 7.6 is supported until March 2027).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/couchbase` |
| Affected versions | `vers:semver/<7.6.0` |
| Date from the source | 2026-07-31 |
| Replacement | A couchbase image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.couchbase.eol-7.2-and-older` |

## Sources

- [Couchbase software lifecycle schedules](https://www.couchbase.com/support-policy/EOL/)
- [Couchbase enterprise software support policy](https://www.couchbase.com/support-policy/enterprise-software/)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use couchbase on one supported Couchbase Server release line.
- Confirm the application and its data or configuration work on the target Couchbase Server release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.couchbase.eol-7.2-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html",
      "url": "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html",
      "headline": "Couchbase Server image release lines 7.2 and older are end-of-life — dates, impact, migration",
      "description": "These Couchbase Server release lines are past their end-of-life date in the vendor's lifecycle schedule (7.2 reached end of life in July 2026; 7.6 is supported until March 2027).",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "container",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Couchbase Server image release lines 7.2 and older are end-of-life",
        "identifier": "pkg:docker/library/couchbase"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Couchbase software lifecycle schedules",
          "url": "https://www.couchbase.com/support-policy/EOL/"
        },
        {
          "@type": "CreativeWork",
          "name": "Couchbase enterprise software support policy",
          "url": "https://www.couchbase.com/support-policy/enterprise-software/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/container.couchbase.eol-7.2-and-older.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:docker/library/couchbase?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2026-07-31. Affected versions: vers:semver/\u003c7.6.0. Source: Couchbase software lifecycle schedules (https://www.couchbase.com/support-policy/EOL/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:docker/library/couchbase?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "A couchbase image on a supported release line"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:docker/library/couchbase?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:docker/library/couchbase."
          }
        }
      ]
    }
  ]
}
</script>
