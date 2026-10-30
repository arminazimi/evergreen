---
title: "Is Angular end of life? — versions, dates, sources"
description: "Angular has releases that are out of support. @angular/core v18 and older are no longer supported. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/npm-angular-core.html"
---

# Is Angular end of life?

**Angular has releases that are out of support.** @angular/core v18 and older are no longer supported. The source gives no day. This page lists 5 reviewed lifecycle rules for `pkg:npm/%40angular/core`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:npm/%40angular/core
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [@angular/core v18 and older are no longer supported](../rules/npm.package.angular.core.v18-and-older.end-of-support.html) | End of support | The source gives no day | `vers:npm/<19.0.0-0` | [Angular release and support schedule](https://angular.dev/reference/releases), [Angular Update Guide](https://angular.dev/update-guide) |
| [@angular/core v19 is no longer supported](../rules/npm.package.angular.core.v19.end-of-support.html) | End of support | The source gives no day | `vers:npm/>=19.0.0-0\|<20.0.0-0` | [Angular release and support schedule](https://angular.dev/reference/releases), [Angular Update Guide](https://angular.dev/update-guide) |
| [@angular/core v22 reaches end of life on 2028-06-30](../rules/npm.package.angular.core.v22.scheduled-end-of-life.html) | Scheduled end of life | 2028-06-30 | `vers:npm/>=22.0.0-0\|<23.0.0-0` | [Angular release and support schedule](https://angular.dev/reference/releases), [Angular Update Guide](https://angular.dev/update-guide) |
| [@angular/core v21 reaches end of life on 2027-06-30](../rules/npm.package.angular.core.v21.scheduled-end-of-life.html) | Scheduled end of life | 2027-06-30 | `vers:npm/>=21.0.0-0\|<22.0.0-0` | [Angular release and support schedule](https://angular.dev/reference/releases), [Angular Update Guide](https://angular.dev/update-guide) |
| [@angular/core v20 reaches end of life on 2026-11-28](../rules/npm.package.angular.core.v20.scheduled-end-of-life.html) | Scheduled end of life | 2026-11-28 | `vers:npm/>=20.0.0-0\|<21.0.0-0` | [Angular release and support schedule](https://angular.dev/reference/releases), [Angular Update Guide](https://angular.dev/update-guide) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/npm-angular-core.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/npm-angular-core.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Angular end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Angular has releases that are out of support. @angular/core v18 and older are no longer supported. The source gives no day. This page lists 5 reviewed lifecycle rules for pkg:npm/%40angular/core, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Angular?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:npm/%40angular/core."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Angular dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
