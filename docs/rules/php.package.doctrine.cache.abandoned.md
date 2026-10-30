---
title: "doctrine/cache is abandoned — dates, impact, migration"
description: "Packagist marks doctrine/cache as abandoned and no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html"
image: "/assets/og/php.package.doctrine.cache.abandoned.svg"
json_twin: "/rules/php.package.doctrine.cache.abandoned.json"
---

# doctrine/cache is abandoned

**Deprecated.** The source gives no day. Source: [doctrine/cache on Packagist](https://packagist.org/packages/doctrine/cache).

Check a version:

```bash
evergreen check pkg:composer/doctrine/cache
```

Packagist marks doctrine/cache as abandoned and no longer maintained.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/doctrine/cache` |
| Affected versions | `vers:composer/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `php.package.doctrine.cache.abandoned` |

## Sources

- [doctrine/cache on Packagist](https://packagist.org/packages/doctrine/cache)
- [doctrine/cache Composer metadata](https://repo.packagist.org/p2/doctrine/cache.json)

## Migration

**Constraints**

- Keep composer.json and composer.lock consistent after removing doctrine/cache, and check that no other package still requires it.
- Preserve existing behavior while replacing the abandoned package; review its public API usage before choosing a replacement.

**Steps**

1. **Replace the abandoned package.** Remove doctrine/cache from composer.json and replace it with a maintained alternative that fits how the project uses it, then run `composer update`.

**Verification**

- `composer validate && composer install`: Confirm the Composer project is valid and installs without the abandoned package.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite after the replacement.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.doctrine.cache.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html",
      "headline": "doctrine/cache is abandoned — dates, impact, migration",
      "description": "Packagist marks doctrine/cache as abandoned and no longer maintained.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "deprecated",
        "php",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "doctrine/cache is abandoned",
        "identifier": "pkg:composer/doctrine/cache"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "doctrine/cache on Packagist",
          "url": "https://packagist.org/packages/doctrine/cache"
        },
        {
          "@type": "CreativeWork",
          "name": "doctrine/cache Composer metadata",
          "url": "https://repo.packagist.org/p2/doctrine/cache.json"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/php.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.doctrine.cache.abandoned.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:composer/doctrine/cache?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:composer/*. Source: doctrine/cache on Packagist (https://packagist.org/packages/doctrine/cache)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:composer/doctrine/cache?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:composer/doctrine/cache."
          }
        }
      ]
    }
  ]
}
</script>
