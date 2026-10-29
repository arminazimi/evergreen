---
title: "agentops-toolkit was renamed and is no longer maintained — dates, impact, migration"
description: "The maintainer states that agentops-toolkit is no longer maintained and now ships as agentops-accelerator."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.agentops-toolkit.eol.html"
---

# agentops-toolkit was renamed and is no longer maintained

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

- [agentops-toolkit rename notice](https://pypi.org/project/agentops-toolkit/)

## Migration

**Constraints**

- Preserve the agentops import path, CLI entrypoints, public APIs, configuration, telemetry, and stored project state.

**Steps**

1. **Move to agentops-accelerator.** Replace the distribution with agentops-accelerator while retaining existing agentops imports and verifying CLI and public API compatibility.

**Verification**

- `python -m pytest`: Run AgentOps API, CLI, telemetry, and project tests when defined.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.agentops-toolkit.eol`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
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
}
</script>
