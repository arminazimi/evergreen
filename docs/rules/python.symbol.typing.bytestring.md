---
title: "Typing.ByteString is deprecated — dates, impact, migration"
description: "Python 3.9 deprecates typing.ByteString, to be removed in Python 3.17."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html"
json_twin: "/rules/python.symbol.typing.bytestring.json"
---

# Typing.ByteString is deprecated

**Deprecated.** The source gives no day. Replacement: collections.abc.Buffer, or an explicit union. Source: [Python deprecations: pending removal in 3.17](https://docs.python.org/3/deprecations/pending-removal-in-3.17.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.9 deprecates typing.ByteString, to be removed in Python 3.17.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.9` |
| Date from the source | The source gives no day |
| Replacement | collections.abc.Buffer, or an explicit union |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `python.symbol.typing.bytestring` |

## Sources

- [Python deprecations: pending removal in 3.17](https://docs.python.org/3/deprecations/pending-removal-in-3.17.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of typing.ByteString with collections.abc.Buffer, or an explicit union.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings as errors when pytest is used.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [ast.Num, Str, Bytes, NameConstant and Ellipsis are deprecated](python.symbol.ast.constant-nodes.html)
- [asyncio child watcher functions are deprecated](python.symbol.asyncio.child-watcher.html)
- [asyncio.get_event_loop warns when it has to create a loop](python.symbol.asyncio.get-event-loop.html)
- [Configparser.SafeConfigParser has been removed](python.symbol.configparser.safeconfigparser.html)
- [Ctypes.SetPointerType is deprecated](python.symbol.ctypes.setpointertype.html)
- [datetime.utcfromtimestamp is deprecated](python.symbol.datetime.utcfromtimestamp.html)
- [datetime.utcnow is deprecated](python.symbol.datetime.utcnow.html)
- [Glob.glob0 and glob.glob1 are deprecated](python.symbol.glob.glob0.html)
- [Http.server.CGIHTTPRequestHandler is deprecated](python.symbol.http.server.cgihttprequesthandler.html)
- [Imp.cache_from_source has been removed](python.symbol.imp.cache-from-source.html)
- [Imp.find_module has been removed](python.symbol.imp.find-module.html)
- [Imp.get_magic has been removed](python.symbol.imp.get-magic.html)

### Same ecosystem

- [agentops-toolkit was renamed and is no longer maintained](python.package.agentops-toolkit.eol.html)
- [aiohttp-valera-validator was renamed and is no longer maintained](python.package.aiohttp-valera-validator.eol.html)
- [api-shield is deprecated](python.package.api-shield.deprecated.html)
- [apisec-code-bolt was renamed](python.package.apisec-code-bolt.deprecated.html)
- [argparse is archived on PyPI](python.package.argparse.archived.html)
- [asyncio-requests is retired](python.package.asyncio-requests.deprecated.html)
- [BatchNotebook is deprecated](python.package.batchnotebook.deprecated.html)
- [cmip_ref was renamed and is no longer maintained](python.package.cmip-ref.eol.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.typing.bytestring`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html",
      "headline": "Typing.ByteString is deprecated — dates, impact, migration",
      "description": "Python 3.9 deprecates typing.ByteString, to be removed in Python 3.17.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "deprecated",
        "python",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Typing.ByteString is deprecated",
        "identifier": "pkg:generic/python"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Python deprecations: pending removal in 3.17",
          "url": "https://docs.python.org/3/deprecations/pending-removal-in-3.17.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.typing.bytestring.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:pypi/>=3.9. Source: Python deprecations: pending removal in 3.17 (https://docs.python.org/3/deprecations/pending-removal-in-3.17.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "collections.abc.Buffer, or an explicit union"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/python."
          }
        }
      ]
    }
  ]
}
</script>
