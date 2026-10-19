---
title: "zendframework/zend-stdlib is abandoned — dates, impact, migration"
description: "Packagist marks zendframework/zend-stdlib as abandoned and no longer maintained, and the author suggests using laminas/laminas-stdlib instead."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.zendframework.zend-stdlib.abandoned.html"
---

# zendframework/zend-stdlib is abandoned

Packagist marks zendframework/zend-stdlib as abandoned and no longer maintained, and the author suggests using laminas/laminas-stdlib instead. The Laminas Project announced that Zend Framework packages were archived and marked abandoned on Packagist when the project moved to Laminas.

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

## Detected by

No built-in detector reads `php` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/php.json).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.zendframework.zend-stdlib.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
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
}
</script>
