---
title: "PyCrypto is obsolete and vulnerable — dates, impact, migration"
description: "The archived project warns that PyCrypto 2.x is unmaintained, obsolete, and contains security vulnerabilities."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html"
json_twin: "/rules/python.package.pycrypto.obsolete.json"
---

# PyCrypto is obsolete and vulnerable

**End of life** as of 2022-01-27. Replacement: pycryptodome or cryptography. Source: [Archived PyCrypto repository warning](https://github.com/pycrypto/pycrypto).

Check a version:

```bash
evergreen check pkg:pypi/pycrypto
```

The archived project warns that PyCrypto 2.x is unmaintained, obsolete, and contains security vulnerabilities.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | critical |
| Ecosystem | `python` |
| Component | `pkg:pypi/pycrypto` |
| Affected versions | `vers:pypi/*` |
| Date from the source | 2022-01-27 |
| Replacement | pycryptodome or cryptography |
| Evidence last seen | 2026-10-14 |
| Reviewed | 2026-10-14 by arminazimi |
| Review due | 2027-10-14 (365 days after the last review) |
| Rule ID | `python.package.pycrypto.obsolete` |

## Sources

- [Archived PyCrypto repository warning](https://github.com/pycrypto/pycrypto)

## Migration

**Constraints**

- Treat this as a security-sensitive migration: preserve algorithms, modes, key sizes, padding, nonces or IVs, authentication tags, and serialized ciphertext formats.
- Do not silently change cryptographic primitives or defaults without explicit compatibility and security review.

**Steps**

1. **Choose the maintained library.** Select pycryptodome for a closer Crypto namespace migration or cryptography for a higher-level maintained interface.
2. **Migrate cryptographic usages.** Update every reported import and operation, making keys, modes, padding, nonces, tags, and encoding explicit.
3. **Replace the dependency.** Remove pycrypto, add the selected maintained package, and regenerate the environment lock data.
4. **Verify cryptographic test vectors.** Confirm known plaintext/ciphertext vectors and backward compatibility with persisted encrypted data.

**Verification**

- `python -m pytest`: Run cryptographic vectors and repository tests.
- `python -m pip check`: Check installed dependency compatibility.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

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

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pycrypto.obsolete`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html",
      "headline": "PyCrypto is obsolete and vulnerable — dates, impact, migration",
      "description": "The archived project warns that PyCrypto 2.x is unmaintained, obsolete, and contains security vulnerabilities.",
      "inLanguage": "en",
      "dateModified": "2026-10-14",
      "keywords": [
        "end-of-life",
        "python",
        "critical"
      ],
      "about": {
        "@type": "Thing",
        "name": "PyCrypto is obsolete and vulnerable",
        "identifier": "pkg:pypi/pycrypto"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Archived PyCrypto repository warning",
          "url": "https://github.com/pycrypto/pycrypto"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/python.package.pycrypto.obsolete.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pypi/pycrypto?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2022-01-27. Affected versions: vers:pypi/*. Source: Archived PyCrypto repository warning (https://github.com/pycrypto/pycrypto)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:pypi/pycrypto?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "pycryptodome or cryptography"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pypi/pycrypto?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pypi/pycrypto."
          }
        }
      ]
    }
  ]
}
</script>
