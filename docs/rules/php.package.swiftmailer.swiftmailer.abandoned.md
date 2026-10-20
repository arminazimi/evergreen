---
title: "swiftmailer/swiftmailer is abandoned — dates, impact, migration"
description: "Packagist marks swiftmailer/swiftmailer as abandoned and no longer maintained, and the author suggests using symfony/mailer instead."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.swiftmailer.swiftmailer.abandoned.html"
---

# swiftmailer/swiftmailer is abandoned

Packagist marks swiftmailer/swiftmailer as abandoned and no longer maintained, and the author suggests using symfony/mailer instead. The Symfony project set Swiftmailer's end of maintenance for the end of November 2021.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/swiftmailer/swiftmailer` |
| Affected versions | `vers:composer/*` |
| Date from the source | 2021-11-30 |
| Replacement | symfony/mailer |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `php.package.swiftmailer.swiftmailer.abandoned` |

## Sources

- [swiftmailer/swiftmailer on Packagist](https://packagist.org/packages/swiftmailer/swiftmailer)
- [The end of Swiftmailer (Symfony Blog)](https://symfony.com/blog/the-end-of-swiftmailer)

## Migration

**Constraints**

- Preserve message construction, transport configuration, and delivery behavior while moving from Swiftmailer to Symfony Mailer.
- Keep composer.json, composer.lock, and any package that still requires swiftmailer/swiftmailer consistent after the replacement.

**Steps**

1. **Replace the dependency.** Remove swiftmailer/swiftmailer from composer.json and require symfony/mailer (and any transport packages the project needs), then run `composer update`.
2. **Migrate Swiftmailer usages.** Replace reported Swift_Mailer and Swift_Message requires, use statements, constructors, and newInstance calls with the Symfony Mailer Email and Mailer APIs.

**Verification**

- `composer validate && composer show symfony/mailer`: Confirm the Composer project is valid and symfony/mailer is installed.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite with the replacement mailer.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.swiftmailer.swiftmailer.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.package.swiftmailer.swiftmailer.abandoned.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.package.swiftmailer.swiftmailer.abandoned.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.swiftmailer.swiftmailer.abandoned.html",
  "headline": "swiftmailer/swiftmailer is abandoned — dates, impact, migration",
  "description": "Packagist marks swiftmailer/swiftmailer as abandoned and no longer maintained, and the author suggests using symfony/mailer instead.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "swiftmailer/swiftmailer is abandoned",
    "identifier": "pkg:composer/swiftmailer/swiftmailer"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "swiftmailer/swiftmailer on Packagist",
      "url": "https://packagist.org/packages/swiftmailer/swiftmailer"
    },
    {
      "@type": "CreativeWork",
      "name": "The end of Swiftmailer (Symfony Blog)",
      "url": "https://symfony.com/blog/the-end-of-swiftmailer"
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
