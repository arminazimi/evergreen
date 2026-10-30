---
title: "PHP 7.0 is end-of-life — dates, impact, migration"
description: "The PHP release branches list marks PHP 7.0 as end of life: active support ended on 2018-01-04 and security support ended on 2019-01-10."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html"
image: "/assets/og/php.runtime.eol-7.0.svg"
json_twin: "/rules/php.runtime.eol-7.0.json"
---

# PHP 7.0 is end-of-life

**End of life** as of 2019-01-10. Replacement: PHP 8.4 or later. Source: [PHP release branches](https://www.php.net/releases/branches.php).

Check a version:

```bash
evergreen check pkg:generic/php
```

The PHP release branches list marks PHP 7.0 as end of life: active support ended on 2018-01-04 and security support ended on 2019-01-10.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:generic/php` |
| Affected versions | `vers:semver/>=7.0.0\|<7.1.0` |
| Date from the source | 2019-01-10 |
| Replacement | PHP 8.4 or later |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-01-18 (90 days after the last review) |
| Rule ID | `php.runtime.eol-7.0` |

## Sources

- [PHP release branches](https://www.php.net/releases/branches.php)
- [PHP supported versions](https://www.php.net/supported-versions.php)

## Migration

**Constraints**

- Keep .php-version, .tool-versions, composer.json require.php and config.platform.php, composer.lock platform.php, CI matrices, and container images on one supported PHP release line.
- Confirm Composer packages and extensions build on the target PHP and reinstall dependencies after changing the runtime.

**Steps**

1. **Raise the PHP version.** Change the reported declaration from PHP 7.0 to a supported release (see the replacement), using the project's existing version manager.
2. **Align other PHP version surfaces.** Update CI setup-php versions, Dockerfile `php:` images, composer.json require.php and config.platform.php, and composer.lock platform.php so they agree.

**Verification**

- `php --version`: Confirm the active runtime is the intended release.
- `composer validate && composer install`: Validate and reinstall dependencies on the new PHP.
- `composer validate && vendor/bin/phpunit`: Validate the Composer project and run the PHPUnit suite on the new PHP.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.runtime.eol-7.0`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html",
      "url": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html",
      "headline": "PHP 7.0 is end-of-life — dates, impact, migration",
      "description": "The PHP release branches list marks PHP 7.0 as end of life: active support ended on 2018-01-04 and security support ended on 2019-01-10.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "end-of-life",
        "php",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "PHP 7.0 is end-of-life",
        "identifier": "pkg:generic/php"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "PHP release branches",
          "url": "https://www.php.net/releases/branches.php"
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.0.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/php?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2019-01-10. Affected versions: vers:semver/>=7.0.0|\u003c7.1.0. Source: PHP release branches (https://www.php.net/releases/branches.php)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/php?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "PHP 8.4 or later"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/php?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/php."
          }
        }
      ]
    }
  ]
}
</script>
