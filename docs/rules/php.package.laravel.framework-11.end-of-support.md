---
title: "Laravel 11 is no longer supported — dates, impact, migration"
description: "Laravel's support policy states that security fixes for Laravel 11 ended on 2026-03-12; the release no longer receives security or bug fixes from the Laravel project."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-11.end-of-support.html"
---

# Laravel 11 is no longer supported

Laravel's support policy states that security fixes for Laravel 11 ended on 2026-03-12; the release no longer receives security or bug fixes from the Laravel project.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/laravel/framework` |
| Affected versions | `vers:composer/>=11.0.0\|<12.0.0` |
| Date from the source | 2026-03-12 |
| Replacement | Laravel 13 |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-01-21 (90 days after the last review) |
| Rule ID | `php.package.laravel.framework-11.end-of-support` |

## Sources

- [Laravel support policy](https://laravel.com/docs/releases#support-policy) (accessed 2026-10-23)
- [Laravel 12 upgrade guide](https://laravel.com/docs/12.x/upgrade) (accessed 2026-10-23)
- [Laravel 13 upgrade guide](https://laravel.com/docs/13.x/upgrade) (accessed 2026-10-23)

## Migration

**Constraints**

- Preserve routes, middleware, authentication, authorization, queues, scheduled jobs, database migrations, and externally visible application behavior while changing the Laravel major.
- Upgrade one major at a time and apply each official Laravel upgrade guide in order; do not skip a major when moving to Laravel 13.
- Confirm the target Laravel release supports the project's PHP version and align first-party Laravel packages before regenerating composer.lock.

**Steps**

1. **Raise the Laravel requirement.** Change laravel/framework from 11.x one major at a time (12 and 13) and update the related first-party package constraints named by each official upgrade guide.
2. **Apply each Laravel upgrade guide.** Work through the official upgrade guides for 12 and 13, in order. Review every high-, medium-, and low-impact change that applies to the application and update configuration and code before continuing.
3. **Regenerate the Composer lockfile.** Run Composer with dependency updates enabled for laravel/framework and its related packages, review the resolved versions, and keep composer.json and composer.lock together.

**Verification**

- `composer validate`: Validate composer.json and composer.lock after updating the framework and related packages.
- `php artisan about`: Confirm the application boots and reports the intended Laravel and PHP versions.
- `php artisan test`: Run the Laravel application test suite on the upgraded framework.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.laravel.framework-11.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-11.end-of-support.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-11.end-of-support.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-11.end-of-support.html",
  "headline": "Laravel 11 is no longer supported — dates, impact, migration",
  "description": "Laravel's support policy states that security fixes for Laravel 11 ended on 2026-03-12; the release no longer receives security or bug fixes from the Laravel project.",
  "inLanguage": "en",
  "dateModified": "2026-10-23",
  "keywords": [
    "end-of-support",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Laravel 11 is no longer supported",
    "identifier": "pkg:composer/laravel/framework"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Laravel support policy",
      "url": "https://laravel.com/docs/releases#support-policy"
    },
    {
      "@type": "CreativeWork",
      "name": "Laravel 12 upgrade guide",
      "url": "https://laravel.com/docs/12.x/upgrade"
    },
    {
      "@type": "CreativeWork",
      "name": "Laravel 13 upgrade guide",
      "url": "https://laravel.com/docs/13.x/upgrade"
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
