---
title: "zendframework/zend-stdlib is abandoned — dates, impact, migration"
description: "Packagist marks zendframework/zend-stdlib as abandoned and no longer maintained, and the author suggests using laminas/laminas-stdlib instead."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html"
image: "/assets/og/php.package.zendframework.zend-stdlib.abandoned.svg"
json_twin: "/rules/php.package.zendframework.zend-stdlib.abandoned.json"
---

# zendframework/zend-stdlib is abandoned

**Deprecated** as of 2019-12-31. Replacement: laminas/laminas-stdlib. Source: [zendframework/zend-stdlib on Packagist](https://packagist.org/packages/zendframework/zend-stdlib).

Check a version:

```bash
evergreen check pkg:composer/zendframework/zend-stdlib
```

Packagist marks zendframework/zend-stdlib as abandoned and no longer maintained, and the author suggests using laminas/laminas-stdlib instead. The Laminas Project announced that Zend Framework packages were archived and marked abandoned on Packagist when the project moved to Laminas.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/zendframework/zend-stdlib` |
| Affected versions | `vers:composer/*` |
| Date from the source | 2019-12-31 |
| Replacement | laminas/laminas-stdlib |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `php.package.zendframework.zend-stdlib.abandoned` |

## Sources

- [zendframework/zend-stdlib on Packagist](https://packagist.org/packages/zendframework/zend-stdlib)
- [Endings and Beginnings: Goodbye, and Please Welcome the Laminas Project!](https://www.zendframework.com/blog/2020-01-24-laminas-launch.html)

## Migration

**Constraints**

- Preserve array and parameter helper behavior while moving from Zend\Stdlib to Laminas\Stdlib.
- Keep composer.json, composer.lock, and any package that still requires zendframework/zend-stdlib consistent after the replacement.

**Steps**

1. **Replace the dependency.** Remove zendframework/zend-stdlib from composer.json and require laminas/laminas-stdlib, then run `composer update`.
2. **Migrate Zend\Stdlib usages.** Replace reported Zend\Stdlib use statements, ArrayUtils calls, and Parameters constructors with the Laminas\Stdlib equivalents.

**Verification**

- `composer validate && composer show laminas/laminas-stdlib`: Confirm the Composer project is valid and laminas/laminas-stdlib is installed.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite with the replacement package.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.zendframework.zend-stdlib.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html",
      "headline": "zendframework/zend-stdlib is abandoned — dates, impact, migration",
      "description": "Packagist marks zendframework/zend-stdlib as abandoned and no longer maintained, and the author suggests using laminas/laminas-stdlib instead.",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "php",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "zendframework/zend-stdlib is abandoned",
        "identifier": "pkg:composer/zendframework/zend-stdlib"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "zendframework/zend-stdlib on Packagist",
          "url": "https://packagist.org/packages/zendframework/zend-stdlib"
        },
        {
          "@type": "CreativeWork",
          "name": "Endings and Beginnings: Goodbye, and Please Welcome the Laminas Project!",
          "url": "https://www.zendframework.com/blog/2020-01-24-laminas-launch.html"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:composer/zendframework/zend-stdlib?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated as of 2019-12-31. Affected versions: vers:composer/*. Source: zendframework/zend-stdlib on Packagist (https://packagist.org/packages/zendframework/zend-stdlib)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:composer/zendframework/zend-stdlib?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "laminas/laminas-stdlib"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:composer/zendframework/zend-stdlib?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:composer/zendframework/zend-stdlib."
          }
        }
      ]
    }
  ]
}
</script>
