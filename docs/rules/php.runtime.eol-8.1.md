---
title: "PHP 8.1 is end-of-life — dates, impact, migration"
description: "The PHP unsupported branches page lists the PHP 8.1 branch as end of life on 2025-12-31; the branch no longer receives security or bug fixes from the PHP project."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-8.1.html"
---

# PHP 8.1 is end-of-life

The PHP unsupported branches page lists the PHP 8.1 branch as end of life on 2025-12-31; the branch no longer receives security or bug fixes from the PHP project.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:generic/php` |
| Affected versions | `vers:semver/>=8.1.0\|<8.2.0` |
| Date from the source | 2025-12-31 |
| Replacement | PHP 8.3 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `php.runtime.eol-8.1` |

## Sources

- [PHP unsupported branches](https://www.php.net/eol.php)
- [PHP supported versions](https://www.php.net/supported-versions.php)

## Migration

**Constraints**

- Keep .php-version, .tool-versions, composer.json require.php and config.platform.php, composer.lock platform.php, CI matrices, and container images on one supported PHP release line.
- Confirm Composer packages and extensions build on the target PHP and reinstall dependencies after changing the runtime.

**Steps**

1. **Raise the PHP version.** Change the reported declaration from PHP 8.1 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other PHP version surfaces.** Update CI setup-php versions, Dockerfile `php:` images, composer.json require.php and config.platform.php, and composer.lock platform.php so they agree.

**Verification**

- `php --version`: Confirm the active runtime is the intended release.
- `composer validate && composer install`: Validate and reinstall dependencies on the new PHP.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite on the new PHP.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.runtime.eol-8.1`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-8.1.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-8.1.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-8.1.html",
  "headline": "PHP 8.1 is end-of-life — dates, impact, migration",
  "description": "The PHP unsupported branches page lists the PHP 8.1 branch as end of life on 2025-12-31; the branch no longer receives security or bug fixes from the PHP project.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-life",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PHP 8.1 is end-of-life",
    "identifier": "pkg:generic/php"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "PHP unsupported branches",
      "url": "https://www.php.net/eol.php"
    },
    {
      "@type": "CreativeWork",
      "name": "PHP supported versions",
      "url": "https://www.php.net/supported-versions.php"
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
