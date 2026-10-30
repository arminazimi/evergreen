---
title: "ipaddr is superseded — dates, impact, migration"
description: "The project states that ipaddr was superseded by the Python standard-library ipaddress module and its Python 2 backport."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html"
json_twin: "/rules/python.package.ipaddr.deprecated.json"
---

# ipaddr is superseded

**Deprecated.** The source gives no day. Replacement: ipaddress. Source: [ipaddr supersession notice](https://pypi.org/project/ipaddr/).

Check a version:

```bash
evergreen check pkg:pypi/ipaddr
```

The project states that ipaddr was superseded by the Python standard-library ipaddress module and its Python 2 backport.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/ipaddr` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | ipaddress |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.ipaddr.deprecated` |

## Sources

- [ipaddr supersession notice](https://pypi.org/project/ipaddr/)

## Migration

**Constraints**

- Preserve IPv4 and IPv6 parsing, strictness, network boundaries, address ordering, exception behavior, and text formatting.

**Steps**

1. **Replace ipaddr.** Replace the dependency and translate IPAddress, IPNetwork, and related usages to the standard-library ipaddress API.
2. **Verify address behavior.** Test IPv4, IPv6, malformed input, host bits, networks, containment, and serialization used by the application.

**Verification**

- `python -m pytest`: Run networking edge cases and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.ipaddr.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html",
      "headline": "ipaddr is superseded — dates, impact, migration",
      "description": "The project states that ipaddr was superseded by the Python standard-library ipaddress module and its Python 2 backport.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "ipaddr is superseded",
        "identifier": "pkg:pypi/ipaddr"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "ipaddr supersession notice",
          "url": "https://pypi.org/project/ipaddr/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/python.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.ipaddr.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/ipaddr?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: ipaddr supersession notice (https://pypi.org/project/ipaddr/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/ipaddr?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ipaddress"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/ipaddr?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/ipaddr."
          }
        }
      ]
    }
  ]
}
</script>
