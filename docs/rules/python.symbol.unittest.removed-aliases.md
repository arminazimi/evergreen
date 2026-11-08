---
title: "The deprecated unittest aliases have been removed — dates, impact, migration"
description: "Python 3.12 removed the long-deprecated unittest.TestCase aliases, such as assertEquals() and failUnless(), and assertDictContainsSubset(), so using them raises AttributeError."
layout: doc
permalink: "/rules/python.symbol.unittest.removed-aliases.html"
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html"
image: "/assets/og/python.symbol.unittest.removed-aliases.svg"
review_date: "2026-11-02"
last_modified_at: "2026-11-02"
json_twin: "/rules/python.symbol.unittest.removed-aliases.json"
---

# The deprecated unittest aliases have been removed

**Removed.** The source gives no day. Replacement: The current TestCase methods: assertEqual(), assertNotEqual(), assertTrue(), assertFalse(), assertAlmostEqual(), assertNotAlmostEqual(), assertRegex(), assertNotRegex(), and assertRaises(); assertDictContainsSubset() has none. Source: [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html).

Check a version:

```bash
evergreen check pkg:generic/python
```

Python 3.12 removed the long-deprecated unittest.TestCase aliases, such as assertEquals() and failUnless(), and assertDictContainsSubset(), so using them raises AttributeError.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:generic/python` |
| Affected versions | `vers:pypi/>=3.12` |
| Date from the source | The source gives no day |
| Replacement | The current TestCase methods: assertEqual(), assertNotEqual(), assertTrue(), assertFalse(), assertAlmostEqual(), assertNotAlmostEqual(), assertRegex(), assertNotRegex(), and assertRaises(); assertDictContainsSubset() has none |
| Evidence last seen | 2026-11-02 |
| Reviewed | 2026-11-02 by arminazimi |
| Review due | 2027-11-02 (365 days after the last review) |
| Rule ID | `python.symbol.unittest.removed-aliases` |

## Sources

- [What's New in Python 3.12](https://docs.python.org/3/whatsnew/3.12.html) (accessed 2026-11-02)

## Migration

**Constraints**

- Keep the behavior of the test unchanged; each alias calls the method its replacement names.
- assertDictContainsSubset() has no replacement, so its assertion must be rewritten by hand.

**Steps**

1. **Replace the alias.** Replace each reported alias with the current TestCase method that What's New in Python 3.12 names; rewrite an assertDictContainsSubset() call by hand, because it has no replacement.

**Verification**

- `python -W error::DeprecationWarning -m pytest`: Run the tests with deprecation warnings treated as errors when pytest is used.

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

- [The aifc module was removed in Python 3.13](python.module.aifc.removed.html)
- [The asynchat module was removed in Python 3.12](python.module.asynchat.removed.html)
- [The asyncore module was removed in Python 3.12](python.module.asyncore.removed.html)
- [The audioop module was removed in Python 3.13](python.module.audioop.removed.html)
- [The cgi module was removed in Python 3.13](python.module.cgi.removed.html)
- [The cgitb module was removed in Python 3.13](python.module.cgitb.removed.html)
- [The chunk module was removed in Python 3.13](python.module.chunk.removed.html)
- [The crypt module was removed in Python 3.13](python.module.crypt.removed.html)


## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.symbol.unittest.removed-aliases`, in the `ebb.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html",
      "headline": "The deprecated unittest aliases have been removed — dates, impact, migration",
      "description": "Python 3.12 removed the long-deprecated unittest.TestCase aliases, such as assertEquals() and failUnless(), and assertDictContainsSubset(), so using them raises AttributeError.",
      "inLanguage": "en",
      "dateModified": "2026-11-02",
      "keywords": [
        "removed",
        "python",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "The deprecated unittest aliases have been removed",
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.symbol.unittest.removed-aliases.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed. The source gives no day. Affected versions: vers:pypi/>=3.12. Source: What's New in Python 3.12 (https://docs.python.org/3/whatsnew/3.12.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/python?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The current TestCase methods: assertEqual(), assertNotEqual(), assertTrue(), assertFalse(), assertAlmostEqual(), assertNotAlmostEqual(), assertRegex(), assertNotRegex(), and assertRaises(); assertDictContainsSubset() has none"
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
