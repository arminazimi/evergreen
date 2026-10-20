---
title: "fzaninotto/faker is abandoned — dates, impact, migration"
description: "Packagist marks fzaninotto/faker as abandoned and no longer maintained."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.fzaninotto.faker.abandoned.html"
---

# fzaninotto/faker is abandoned

Packagist marks fzaninotto/faker as abandoned and no longer maintained.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/fzaninotto/faker` |
| Affected versions | `vers:composer/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `php.package.fzaninotto.faker.abandoned` |

## Sources

- [fzaninotto/faker on Packagist](https://packagist.org/packages/fzaninotto/faker)
- [fzaninotto/faker Composer metadata](https://repo.packagist.org/p2/fzaninotto/faker.json)

## Migration

**Constraints**

- Keep composer.json and composer.lock consistent after removing fzaninotto/faker, and check that no other package still requires it.
- Preserve existing behavior while replacing the abandoned package; review its public API usage before choosing a replacement.

**Steps**

1. **Replace the abandoned package.** Remove fzaninotto/faker from composer.json and replace it with a maintained alternative that fits how the project uses it, then run `composer update`.

**Verification**

- `composer validate && composer install`: Confirm the Composer project is valid and installs without the abandoned package.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite after the replacement.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.fzaninotto.faker.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.package.fzaninotto.faker.abandoned.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.package.fzaninotto.faker.abandoned.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.fzaninotto.faker.abandoned.html",
  "headline": "fzaninotto/faker is abandoned — dates, impact, migration",
  "description": "Packagist marks fzaninotto/faker as abandoned and no longer maintained.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "fzaninotto/faker is abandoned",
    "identifier": "pkg:composer/fzaninotto/faker"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "fzaninotto/faker on Packagist",
      "url": "https://packagist.org/packages/fzaninotto/faker"
    },
    {
      "@type": "CreativeWork",
      "name": "fzaninotto/faker Composer metadata",
      "url": "https://repo.packagist.org/p2/fzaninotto/faker.json"
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
