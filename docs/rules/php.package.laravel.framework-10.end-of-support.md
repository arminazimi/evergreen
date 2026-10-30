---
title: "Laravel 10 is no longer supported — dates, impact, migration"
description: "Laravel's support policy states that security fixes for Laravel 10 ended on 2025-02-04; the release no longer receives security or bug fixes from the Laravel project."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html"
image: "/assets/og/php.package.laravel.framework-10.end-of-support.svg"
json_twin: "/rules/php.package.laravel.framework-10.end-of-support.json"
---

# Laravel 10 is no longer supported

**End of support** as of 2025-02-04. Replacement: Laravel 13. Source: [Laravel support policy](https://laravel.com/docs/releases#support-policy).

Check a version:

```bash
evergreen check pkg:composer/laravel/framework
```

Laravel's support policy states that security fixes for Laravel 10 ended on 2025-02-04; the release no longer receives security or bug fixes from the Laravel project.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:composer/laravel/framework` |
| Affected versions | `vers:composer/>=10.0.0\|<11.0.0` |
| Date from the source | 2025-02-04 |
| Replacement | Laravel 13 |
| Evidence last seen | 2026-10-23 |
| Reviewed | 2026-10-23 by arminazimi |
| Review due | 2027-01-21 (90 days after the last review) |
| Rule ID | `php.package.laravel.framework-10.end-of-support` |

## Sources

- [Laravel support policy](https://laravel.com/docs/releases#support-policy) (accessed 2026-10-23)
- [Laravel 11 upgrade guide](https://laravel.com/docs/11.x/upgrade) (accessed 2026-10-23)
- [Laravel 12 upgrade guide](https://laravel.com/docs/12.x/upgrade) (accessed 2026-10-23)
- [Laravel 13 upgrade guide](https://laravel.com/docs/13.x/upgrade) (accessed 2026-10-23)

## Migration

**Constraints**

- Preserve routes, middleware, authentication, authorization, queues, scheduled jobs, database migrations, and externally visible application behavior while changing the Laravel major.
- Upgrade one major at a time and apply each official Laravel upgrade guide in order; do not skip a major when moving to Laravel 13.
- Confirm the target Laravel release supports the project's PHP version and align first-party Laravel packages before regenerating composer.lock.

**Steps**

1. **Raise the Laravel requirement.** Change laravel/framework from 10.x one major at a time (11, 12, and 13) and update the related first-party package constraints named by each official upgrade guide.
2. **Apply each Laravel upgrade guide.** Work through the official upgrade guides for 11, 12, and 13, in order. Review every high-, medium-, and low-impact change that applies to the application and update configuration and code before continuing.
3. **Regenerate the Composer lockfile.** Run Composer with dependency updates enabled for laravel/framework and its related packages, review the resolved versions, and keep composer.json and composer.lock together.

**Verification**

- `composer validate`: Validate composer.json and composer.lock after updating the framework and related packages.
- `php artisan about`: Confirm the application boots and reports the intended Laravel and PHP versions.
- `php artisan test`: Run the Laravel application test suite on the upgraded framework.

## Detected by

The `php` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.package.laravel.framework-10.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html",
      "headline": "Laravel 10 is no longer supported — dates, impact, migration",
      "description": "Laravel's support policy states that security fixes for Laravel 10 ended on 2025-02-04; the release no longer receives security or bug fixes from the Laravel project.",
      "inLanguage": "en",
      "dateModified": "2026-10-23",
      "keywords": [
        "end-of-support",
        "php",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Laravel 10 is no longer supported",
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
          "name": "Laravel 11 upgrade guide",
          "url": "https://laravel.com/docs/11.x/upgrade"
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
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/php.package.laravel.framework-10.end-of-support.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:composer/laravel/framework?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2025-02-04. Affected versions: vers:composer/>=10.0.0|\u003c11.0.0. Source: Laravel support policy (https://laravel.com/docs/releases#support-policy)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:composer/laravel/framework?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Laravel 13"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:composer/laravel/framework?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:composer/laravel/framework."
          }
        }
      ]
    }
  ]
}
</script>
