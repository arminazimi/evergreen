---
title: "agentops-toolkit was renamed and is no longer maintained — dates, impact, migration"
description: "The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator."
layout: doc
permalink: "/rules/python.package.agentops-toolkit.eol.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html"
image: "/assets/og/python.package.agentops-toolkit.eol.svg"
review_date: "2026-10-16"
last_modified_at: "2026-10-16"
json_twin: "/rules/python.package.agentops-toolkit.eol.json"
---

# agentops-toolkit was renamed and is no longer maintained

**End of life.** The source gives no day. Replacement: agentops-accelerator. Source: [agentops-toolkit rename notice](https://pypi.org/project/agentops-toolkit/).

Check a version:

```bash
evergreen check pkg:pypi/agentops-toolkit
```

The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/agentops-toolkit` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | agentops-accelerator |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.agentops-toolkit.eol` |

## Sources

- [agentops-toolkit rename notice](https://pypi.org/project/agentops-toolkit/) (accessed 2026-10-16)

## Migration

**Constraints**

- Preserve the agentops import path, CLI entrypoints, public APIs, configuration, telemetry, and stored project state.

**Steps**

1. **Move to agentops-accelerator.** Replace the distribution with agentops-accelerator while retaining existing agentops imports and verifying CLI and public API compatibility.

**Verification**

- `python -m pytest`: Run AgentOps API, CLI, telemetry, and project tests when defined.

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

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.agentops-toolkit.eol`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html",
      "headline": "agentops-toolkit was renamed and is no longer maintained — dates, impact, migration",
      "description": "The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator.",
      "inLanguage": "en",
      "dateModified": "2026-10-16",
      "keywords": [
        "end-of-life",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "agentops-toolkit was renamed and is no longer maintained",
        "identifier": "pkg:pypi/agentops-toolkit"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "agentops-toolkit rename notice",
          "url": "https://pypi.org/project/agentops-toolkit/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/agentops-toolkit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life. The source gives no day. Affected versions: vers:pypi/*. Source: agentops-toolkit rename notice (https://pypi.org/project/agentops-toolkit/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/agentops-toolkit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "agentops-accelerator"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/agentops-toolkit?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/agentops-toolkit."
          }
        }
      ]
    }
  ]
}
</script>
