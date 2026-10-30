---
title: "Is Laravel end of life? — versions, dates, sources"
description: "Laravel has releases that are out of support. Laravel 11 is no longer supported as of 2026-03-12."
canonical_url: "https://arminazimi.github.io/evergreen/eol/composer-laravel-framework.html"
---

# Is Laravel end of life?

**Laravel has releases that are out of support.** Laravel 11 is no longer supported as of 2026-03-12. This page lists 2 reviewed lifecycle rules for `pkg:composer/laravel/framework`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:composer/laravel/framework
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Laravel 11 is no longer supported](../rules/php.package.laravel.framework-11.end-of-support.html) | End of support | 2026-03-12 | `vers:composer/>=11.0.0\|<12.0.0` | [Laravel support policy](https://laravel.com/docs/releases#support-policy), [Laravel 12 upgrade guide](https://laravel.com/docs/12.x/upgrade), [Laravel 13 upgrade guide](https://laravel.com/docs/13.x/upgrade) |
| [Laravel 10 is no longer supported](../rules/php.package.laravel.framework-10.end-of-support.html) | End of support | 2025-02-04 | `vers:composer/>=10.0.0\|<11.0.0` | [Laravel support policy](https://laravel.com/docs/releases#support-policy), [Laravel 11 upgrade guide](https://laravel.com/docs/11.x/upgrade), [Laravel 12 upgrade guide](https://laravel.com/docs/12.x/upgrade), [Laravel 13 upgrade guide](https://laravel.com/docs/13.x/upgrade) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/composer-laravel-framework.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/composer-laravel-framework.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Laravel end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Laravel has releases that are out of support. Laravel 11 is no longer supported as of 2026-03-12. This page lists 2 reviewed lifecycle rules for pkg:composer/laravel/framework, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Laravel?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:composer/laravel/framework."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Laravel dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
