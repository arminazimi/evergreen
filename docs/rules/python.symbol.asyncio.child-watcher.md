---
title: "asyncio child watcher functions are deprecated — dates, impact, migration"
description: "Python 3.12 deprecates asyncio.set_child_watcher() and asyncio.get_child_watcher(), to be removed in Python 3.14; the event loop now uses the best available child watcher for each platform."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.child-watcher.html"
json_twin: "/rules/python.symbol.asyncio.child-watcher.json"
---

# asyncio child watcher functions are deprecated

**Deprecated.** The source gives no day. Replacement: Remove manual child watcher configuration. Source: [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.12 deprecates asyncio.set_child_watcher() and asyncio.get_child_watcher(), to be removed in Python 3.14; the event loop now uses the best available child watcher for each platform.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | Remove manual child watcher configuration |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.asyncio.child-watcher` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)
- [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Remove child watcher setup.** Delete the calls; the event loop picks a child watcher for the platform.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.asyncio.child-watcher`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.child-watcher.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.child-watcher.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.child-watcher.html",
  "headline": "asyncio child watcher functions are deprecated — dates, impact, migration",
  "description": "Python 3.12 deprecates asyncio.set_child_watcher() and asyncio.get_child_watcher(), to be removed in Python 3.14; the event loop now uses the best available child watcher for each platform.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "asyncio child watcher functions are deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.12",
      "url": "https://docs.python.org/3/whatsnew/3.12.html"
    },
    {
      "@type": "CreativeWork",
      "name": "Python deprecations: pending removal in 3.14",
      "url": "https://docs.python.org/3/deprecations/pending-removal-in-3.14.html"
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
