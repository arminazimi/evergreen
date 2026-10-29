---
title: "sensiolabs/security-checker is abandoned — dates, impact, migration"
description: "Packagist marks sensiolabs/security-checker as abandoned and no longer maintained, and the author points to https://github.com/fabpot/local-php-security-checker."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.sensiolabs.security-checker.abandoned.html"
---

# sensiolabs/security-checker is abandoned

Packagist marks sensiolabs/security-checker as abandoned and no longer maintained, and the author points to https://github.com/fabpot/local-php-security-checker.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/sensiolabs/security-checker` |
| Affected versions | `vers:composer/*` |
| Date from the source | The source gives no day |
| Replacement | https://github.com/fabpot/local-php-security-checker |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `php.package.sensiolabs.security-checker.abandoned` |

## Sources

- [sensiolabs/security-checker on Packagist](https://packagist.org/packages/sensiolabs/security-checker)
- [sensiolabs/security-checker Composer metadata](https://repo.packagist.org/p2/sensiolabs/security-checker.json)

## Migration

**Constraints**

- Keep composer.json and composer.lock consistent after removing sensiolabs/security-checker, and check that no other package still requires it.
- Preserve existing behavior while replacing the abandoned package; review its public API usage before choosing a replacement.

**Steps**

1. **Replace the abandoned package.** Remove sensiolabs/security-checker from composer.json and adopt the tool the author points to (https://github.com/fabpot/local-php-security-checker), then run `composer update`.

**Verification**

- `composer validate && composer install`: Confirm the Composer project is valid and installs without the abandoned package.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite after the replacement.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.sensiolabs.security-checker.abandoned`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.package.sensiolabs.security-checker.abandoned.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.package.sensiolabs.security-checker.abandoned.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.sensiolabs.security-checker.abandoned.html",
  "headline": "sensiolabs/security-checker is abandoned — dates, impact, migration",
  "description": "Packagist marks sensiolabs/security-checker as abandoned and no longer maintained, and the author points to https://github.com/fabpot/local-php-security-checker.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "sensiolabs/security-checker is abandoned",
    "identifier": "pkg:composer/sensiolabs/security-checker"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "sensiolabs/security-checker on Packagist",
      "url": "https://packagist.org/packages/sensiolabs/security-checker"
    },
    {
      "@type": "CreativeWork",
      "name": "sensiolabs/security-checker Composer metadata",
      "url": "https://repo.packagist.org/p2/sensiolabs/security-checker.json"
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
