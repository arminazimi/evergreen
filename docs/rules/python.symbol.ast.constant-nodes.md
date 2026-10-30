---
title: "ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated — dates, impact, migration"
description: "Python deprecates the ast.Num, ast.Str, ast.Bytes, ast.NameConstant and ast.Ellipsis node classes since 3.8; they emit a DeprecationWarning and are listed for removal in 3.14."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.ast.constant-nodes.html"
json_twin: "/rules/python.symbol.ast.constant-nodes.json"
---

# ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated

**Deprecated.** The source gives no day. Replacement: ast.Constant. Source: [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python deprecates the ast.Num, ast.Str, ast.Bytes, ast.NameConstant and ast.Ellipsis node classes since 3.8; they emit a DeprecationWarning and are listed for removal in 3.14.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.8` |
| Date from the source | The source gives no day |
| Replacement | ast.Constant |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.ast.constant-nodes` |

## Sources

- [Python deprecations: pending removal in 3.14](https://docs.python.org/3/deprecations/pending-removal-in-3.14.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and return-type differences.

**Steps**

1. **Use ast.Constant.** Replace each class with ast.Constant and read .value instead of .n, .s or .value of the old node.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.ast.constant-nodes`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.ast.constant-nodes.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.ast.constant-nodes.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.ast.constant-nodes.html",
  "headline": "ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated — dates, impact, migration",
  "description": "Python deprecates the ast.Num, ast.Str, ast.Bytes, ast.NameConstant and ast.Ellipsis node classes since 3.8; they emit a DeprecationWarning and are listed for removal in 3.14.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "deprecated",
    "python",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated",
    "identifier": "pkg:generic/python"
  },
  "citation": [
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
