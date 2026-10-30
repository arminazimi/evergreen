---
title: "crypto.createCipher and createDecipher have been removed — dates, impact, migration"
description: "Node.js removed crypto.createCipher() and crypto.createDecipher() because they use a weak key derivation (MD5, no salt) and static IVs (DEP0106, end-of-life since v22.0.0)."
canonical_url: "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html"
image: "/assets/og/nodejs.symbol.crypto.createcipher.svg"
json_twin: "/rules/nodejs.symbol.crypto.createcipher.json"
---

# crypto.createCipher and createDecipher have been removed

**Removed.** The source gives no day. Replacement: crypto.createCipheriv() and crypto.createDecipheriv(), with keys from crypto.scrypt() or crypto.pbkdf2() and random salts. Source: [Node.js deprecations: DEP0106 crypto.createCipher](https://nodejs.org/api/deprecations.html).

Check a version:

```bash
evergreen check pkg:generic/nodejs
```

Node.js removed crypto.createCipher() and crypto.createDecipher() because they use a weak key derivation (MD5, no salt) and static IVs (DEP0106, end-of-life since v22.0.0).

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `nodejs` |
| Component | `pkg:generic/nodejs` |
| Affected versions | `vers:semver/>=22.0.0` |
| Date from the source | The source gives no day |
| Replacement | crypto.createCipheriv() and crypto.createDecipheriv(), with keys from crypto.scrypt() or crypto.pbkdf2() and random salts |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `nodejs.symbol.crypto.createcipher` |

## Sources

- [Node.js deprecations: DEP0106 crypto.createCipher](https://nodejs.org/api/deprecations.html)

## Migration

**Constraints**

- Keep the behavior of the call unchanged; check the replacement's argument and error handling differences.

**Steps**

1. **Switch to the iv variants.** Derive the key with crypto.scrypt and a random salt, generate a random IV, and call createCipheriv or createDecipheriv; existing ciphertext needs a decryption-then-reencrypt migration.

**Verification**

- `npm run test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/nodejs.json`](https://github.com/arminazimi/evergreen/blob/main/registry/nodejs.json), rule `nodejs.symbol.crypto.createcipher`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html",
      "headline": "crypto.createCipher and createDecipher have been removed — dates, impact, migration",
      "description": "Node.js removed crypto.createCipher() and crypto.createDecipher() because they use a weak key derivation (MD5, no salt) and static IVs (DEP0106, end-of-life since v22.0.0).",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "removed",
        "nodejs",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "crypto.createCipher and createDecipher have been removed",
        "identifier": "pkg:generic/nodejs"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Node.js deprecations: DEP0106 crypto.createCipher",
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
      "@id": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/nodejs.symbol.crypto.createcipher.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed. The source gives no day. Affected versions: vers:semver/>=22.0.0. Source: Node.js deprecations: DEP0106 crypto.createCipher (https://nodejs.org/api/deprecations.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/nodejs?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "crypto.createCipheriv() and crypto.createDecipheriv(), with keys from crypto.scrypt() or crypto.pbkdf2() and random salts"
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
