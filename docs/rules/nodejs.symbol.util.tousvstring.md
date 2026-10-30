---
title: "Util.toUSVString is deprecated — dates, impact, migration"
description: "Node.js deprecates util.toUSVString (DEP0175: documentation-only since v20.8.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html"
json_twin: "/rules/nodejs.symbol.util.tousvstring.json"
---

# Util.toUSVString is deprecated

**Deprecated.** The source gives no day. Replacement: String.prototype.toWellFormed. Source: [Node.js deprecations: DEP0175](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js deprecates util.toUSVString (DEP0175: documentation-only since v20.8.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=20.8.0` |
| Date from the source | The source gives no day |
| Replacement | String.prototype.toWellFormed |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.util.tousvstring` |

## Sources

- [Node.js deprecations: DEP0175](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the code unchanged; check the replacement's argument and return-value differences.

**Steps**

1. **Replace the usage.** Replace each reported use of util.toUSVString with String.prototype.toWellFormed.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Assert.CallTracker has been removed](nodejs.symbol.assert.calltracker.html)
- [Async_hooks.currentId has been removed](nodejs.symbol.async-hooks.currentid.html)
- [Async_hooks.triggerId has been removed](nodejs.symbol.async-hooks.triggerid.html)
- [The Buffer() constructor is deprecated](nodejs.symbol.buffer.constructor.html)
- [The customFds option of child_process has been removed](nodejs.symbol.child-process.customfds.html)
- [New crypto.Certificate() is deprecated](nodejs.symbol.crypto.certificate.html)
- [crypto.createCipher and createDecipher have been removed](nodejs.symbol.crypto.createcipher.html)
- [Crypto.createCredentials has been removed](nodejs.symbol.crypto.createcredentials.html)
- [Crypto.Credentials has been removed](nodejs.symbol.crypto.credentials.html)
- [Crypto.DEFAULT_ENCODING has been removed](nodejs.symbol.crypto.default-encoding.html)
- [Crypto.fips is deprecated](nodejs.symbol.crypto.fips.html)
- [The crypto.Hash constructor is deprecated](nodejs.symbol.crypto.hash.html)

### Same ecosystem

- [Node.js 18 is end-of-life](nodejs.runtime.eol-18.html)
- [Node.js 19 is end-of-life](nodejs.runtime.eol-19.html)
- [Node.js 20 is end-of-life](nodejs.runtime.eol-20.html)
- [Node.js 21 is end-of-life](nodejs.runtime.eol-21.html)
- [Node.js 22 reaches end-of-life on 2027-04-30](nodejs.runtime.eol-22.html)
- [Node.js 23 is end-of-life](nodejs.runtime.eol-23.html)
- [Node.js 25 is end-of-life](nodejs.runtime.eol-25.html)
- [Legacy Node.js runtime is end-of-life](nodejs.runtime.legacy.html)


## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.util.tousvstring`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html",
      "headline": "Util.toUSVString is deprecated — dates, impact, migration",
      "description": "Node.js deprecates util.toUSVString (DEP0175: documentation-only since v20.8.0).",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "deprecated",
        "nodejs",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Util.toUSVString is deprecated",
        "identifier": "pkg:generic/nodejs"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Node.js deprecations: DEP0175",
          "url": "https://nodejs.org/api/deprecations.html"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.util.tousvstring.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/>=20.8.0. Source: Node.js deprecations: DEP0175 (https://nodejs.org/api/deprecations.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "String.prototype.toWellFormed"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/nodejs."
          }
        }
      ]
    }
  ]
}
</script>
