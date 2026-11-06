---
title: "vsscale is deprecated — dates, impact, migration"
description: "The maintainer states that vsscale is deprecated and directs users to vsjetpack."
layout: doc
permalink: "/rules/python.package.vsscale.deprecated.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html"
image: "/assets/og/python.package.vsscale.deprecated.svg"
review_date: "2026-10-16"
last_modified_at: "2026-10-16"
json_twin: "/rules/python.package.vsscale.deprecated.json"
---

# vsscale is deprecated

**Deprecated.** The source gives no day. Replacement: vsjetpack. Source: [vsscale deprecation notice](https://pypi.org/project/vsscale/).

Check a version:

```bash
evergreen check pkg:pypi/vsscale
```

The maintainer states that vsscale is deprecated and directs users to vsjetpack.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/vsscale` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | vsjetpack |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.vsscale.deprecated` |

## Sources

- [vsscale deprecation notice](https://pypi.org/project/vsscale/) (accessed 2026-10-16)

## Migration

**Constraints**

- Preserve scaling kernels, descaling behavior, clip formats, dimensions, chroma handling, and VapourSynth frame output.

**Steps**

1. **Move to vsjetpack.** Replace vsscale with vsjetpack and translate scaling and descaling imports and calls to the maintained APIs.

**Verification**

- `python -m pytest`: Run VapourSynth scaling, format, dimension, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [The aifc module was removed in Python 3.13](python.module.aifc.removed.html)
- [The asynchat module was removed in Python 3.12](python.module.asynchat.removed.html)
- [The asyncore module was removed in Python 3.12](python.module.asyncore.removed.html)
- [The audioop module was removed in Python 3.13](python.module.audioop.removed.html)
- [The cgi module was removed in Python 3.13](python.module.cgi.removed.html)
- [The cgitb module was removed in Python 3.13](python.module.cgitb.removed.html)
- [The chunk module was removed in Python 3.13](python.module.chunk.removed.html)
- [The crypt module was removed in Python 3.13](python.module.crypt.removed.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.vsscale.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
      "headline": "vsscale is deprecated — dates, impact, migration",
      "description": "The maintainer states that vsscale is deprecated and directs users to vsjetpack.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "deprecated",
        "python",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "vsscale is deprecated",
        "identifier": "pkg:pypi/vsscale"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "vsscale deprecation notice",
          "url": "https://pypi.org/project/vsscale/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.vsscale.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/vsscale?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/*. Source: vsscale deprecation notice (https://pypi.org/project/vsscale/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/vsscale?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "vsjetpack"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/vsscale?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/vsscale."
          }
        }
      ]
    }
  ]
}
</script>
