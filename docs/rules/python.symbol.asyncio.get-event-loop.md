---
title: "asyncio.get_event_loop warns when it has to create a loop — dates, impact, migration"
description: "In Python 3.12 the default event loop policy's get_event_loop() emits a DeprecationWarning when there is no current event loop and it decides to create one."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.get-event-loop.html"
---

# asyncio.get_event_loop warns when it has to create a loop

In Python 3.12 the default event loop policy's get_event_loop() emits a DeprecationWarning when there is no current event loop and it decides to create one.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | asyncio.run() at entry points, or asyncio.get_running_loop() inside coroutines |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.asyncio.get-event-loop` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Stop creating loops implicitly.** Use asyncio.run(main()) at the entry point and asyncio.get_running_loop() inside coroutines.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.asyncio.get-event-loop`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.get-event-loop.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.get-event-loop.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.asyncio.get-event-loop.html",
  "headline": "asyncio.get_event_loop warns when it has to create a loop — dates, impact, migration",
  "description": "In Python 3.12 the default event loop policy's get_event_loop() emits a DeprecationWarning when there is no current event loop and it decides to create one.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "asyncio.get_event_loop warns when it has to create a loop",
    "identifier": "pkg:generic/python"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "What's New in Python 3.12",
      "url": "https://docs.python.org/3/whatsnew/3.12.html"
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
