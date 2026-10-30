---
title: "Is Vue end of life? — versions, dates, sources"
description: "Some Vue releases are end of life. Vue 2 is end-of-life as of 2023-12-31. This page lists 1 reviewed lifecycle rule for pkg:npm/vue, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/vue.html"
---

# Is Vue end of life?

**Some Vue releases are end of life.** Vue 2 is end-of-life as of 2023-12-31. This page lists 1 reviewed lifecycle rule for `pkg:npm/vue`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:npm/vue
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Vue 2 is end-of-life](../rules/npm.package.vue.eol-2.html) | End of life | 2023-12-31 | `vers:npm/>=2.0.0\|<3.0.0` | [Vue 2 LTS, EOL &amp; Extended Support](https://v2.vuejs.org/lts/), [Vue 3 Migration Guide](https://v3-migration.vuejs.org/), [Vue 3 Migration Guide: Migration Build](https://v3-migration.vuejs.org/migration-build.html), [Vue 3 Migration Guide: Breaking Changes](https://v3-migration.vuejs.org/breaking-changes/), [Vue 3 Migration Guide: Global API](https://v3-migration.vuejs.org/breaking-changes/global-api.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/vue.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/vue.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Vue end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Vue releases are end of life. Vue 2 is end-of-life as of 2023-12-31. This page lists 1 reviewed lifecycle rule for pkg:npm/vue, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Vue?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:npm/vue."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Vue dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
