---
title: "Node.js 22 reaches end-of-life on 2027-04-30 — dates, impact, migration"
description: "Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, according to the Node.js Release Working Group schedule."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html"
json_twin: "/rules/nodejs.runtime.eol-22.json"
---

# Node.js 22 reaches end-of-life on 2027-04-30

**Scheduled end of life** as of 2027-04-30. Replacement: Node.js 24 LTS or later. Source: [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, according to the Node.js Release Working Group schedule.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=22.0.0\|<23.0.0` |
| Date from the source | 2027-04-30 |
| Replacement | Node.js 24 LTS or later |
| Evidence last seen | 2026-10-24 |
| Reviewed | 2026-10-24 by arminazimi |
| Review due | 2027-10-24 (365 days after the last review) |
| Rule ID | `nodejs.runtime.eol-22` |

## Sources

- [Node.js Release Working Group schedule](https://github.com/nodejs/Release/blob/main/schedule.json)

## Migration

**Constraints**

- Keep package metadata, local version files, CI matrices, and deployment runtimes on a mutually compatible Node.js release.
- Confirm native modules and production dependencies support the target Node.js major.

**Steps**

1. **Update the Node.js declaration.** Raise the reported engines or pinned runtime declaration to Node.js 24 LTS or later.
2. **Align runtime surfaces.** Update matching local version files, CI matrices, container images, and deployment configuration.

**Verification**

- `node --version`: Confirm the active Node.js runtime is supported.
- `npm run test --if-present`: Run the repository test suite on the target runtime when defined.
- `npm run build --if-present`: Verify the project builds on the target runtime.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Other versions of this product

- [Node.js 18 is end-of-life](nodejs.runtime.eol-18.html)
- [Node.js 19 is end-of-life](nodejs.runtime.eol-19.html)
- [Node.js 20 is end-of-life](nodejs.runtime.eol-20.html)
- [Node.js 21 is end-of-life](nodejs.runtime.eol-21.html)
- [Node.js 23 is end-of-life](nodejs.runtime.eol-23.html)
- [Node.js 25 is end-of-life](nodejs.runtime.eol-25.html)
- [Legacy Node.js runtime is end-of-life](nodejs.runtime.legacy.html)

### Same ecosystem

- [Assert.CallTracker has been removed](nodejs.symbol.assert.calltracker.html)
- [Async_hooks.currentId has been removed](nodejs.symbol.async-hooks.currentid.html)
- [Async_hooks.triggerId has been removed](nodejs.symbol.async-hooks.triggerid.html)
- [The Buffer() constructor is deprecated](nodejs.symbol.buffer.constructor.html)
- [The customFds option of child_process has been removed](nodejs.symbol.child-process.customfds.html)
- [New crypto.Certificate() is deprecated](nodejs.symbol.crypto.certificate.html)
- [crypto.createCipher and createDecipher have been removed](nodejs.symbol.crypto.createcipher.html)
- [Crypto.createCredentials has been removed](nodejs.symbol.crypto.createcredentials.html)


## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.runtime.eol-22`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html",
      "headline": "Node.js 22 reaches end-of-life on 2027-04-30 — dates, impact, migration",
      "description": "Node.js 22 is scheduled to stop receiving security and bug fixes on 2027-04-30, according to the Node.js Release Working Group schedule.",
      "inLanguage": "en",
      "dateModified": "2026-10-24",
      "keywords": [
        "scheduled-end-of-life",
        "nodejs",
        "low"
      ],
      "about": {
        "@type": "Thing",
        "name": "Node.js 22 reaches end-of-life on 2027-04-30",
        "identifier": "pkg:generic/nodejs"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Node.js Release Working Group schedule",
          "url": "https://github.com/nodejs/Release/blob/main/schedule.json"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.runtime.eol-22.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Scheduled end of life as of 2027-04-30. Affected versions: vers:semver/>=22.0.0|\u003c23.0.0. Source: Node.js Release Working Group schedule (https://github.com/nodejs/Release/blob/main/schedule.json)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Node.js 24 LTS or later"
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
