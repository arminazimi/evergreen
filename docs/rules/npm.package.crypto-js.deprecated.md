---
title: "crypto-js is deprecated — dates, impact, migration"
description: "npm marks crypto-js as deprecated: \"Active development of CryptoJS has been discontinued. This library is no longer maintained.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.crypto-js.deprecated.html"
---

# crypto-js is deprecated

npm marks crypto-js as deprecated: "Active development of CryptoJS has been discontinued. This library is no longer maintained."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/crypto-js` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Web Crypto API (globalThis.crypto.subtle) or a maintained cryptography library |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.crypto-js.deprecated` |

## Sources

- [crypto-js on npm](https://www.npmjs.com/package/crypto-js)
- [crypto-js registry metadata](https://registry.npmjs.org/crypto-js/latest)

## Migration

**Constraints**

- Preserve the algorithms, modes, padding, key derivation, and output encodings each call site relies on, so data encrypted before the change still decrypts afterwards.

**Steps**

1. **Audit every cryptographic call.** List each hash, cipher, KDF, HMAC, and encoding call with its algorithm, mode, padding, IV, and key size.
2. **Reimplement with a maintained implementation.** Replace each call with the Web Crypto API or a maintained library that supports the same algorithms and parameters.
3. **Remove crypto-js.** Remove crypto-js from dependencies and the lockfile once no call sites remain.

**Verification**

- `npm run test --if-present`: Round-trip existing ciphertext and compare known-answer vectors in the repository tests.
- `npm run build --if-present`: Type-check and build every affected entry point.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.crypto-js.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.crypto-js.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.crypto-js.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.crypto-js.deprecated.html",
  "headline": "crypto-js is deprecated — dates, impact, migration",
  "description": "npm marks crypto-js as deprecated: \"Active development of CryptoJS has been discontinued. This library is no longer maintained.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "crypto-js is deprecated",
    "identifier": "pkg:npm/crypto-js"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "crypto-js on npm",
      "url": "https://www.npmjs.com/package/crypto-js"
    },
    {
      "@type": "CreativeWork",
      "name": "crypto-js registry metadata",
      "url": "https://registry.npmjs.org/crypto-js/latest"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
