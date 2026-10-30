---
title: "@angular/core v19 is no longer supported — dates, impact, migration"
description: "Angular's release schedule states that Angular versions v2 to v19 are no longer supported. v19 receives no fixes, including security fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html"
json_twin: "/rules/npm.package.angular.core.v19.end-of-support.json"
---

# @angular/core v19 is no longer supported

**End of support.** The source gives no day. Replacement: @angular/core@22. Source: [Angular release and support schedule](https://angular.dev/reference/releases).

Check a version:

```bash
evergreen check pkg:npm/%40angular/core
```

Angular's release schedule states that Angular versions v2 to v19 are no longer supported. v19 receives no fixes, including security fixes.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40angular/core` |
| Affected versions | `vers:npm/>=19.0.0-0\|<20.0.0-0` |
| Date from the source | The source gives no day |
| Replacement | @angular/core@22 |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `npm.package.angular.core.v19.end-of-support` |

## Sources

- [Angular release and support schedule](https://angular.dev/reference/releases)
- [Angular Update Guide](https://angular.dev/update-guide)

## Migration

**Constraints**

- Update one major at a time. ng update accepts only a supported target major, and v20 is the only one-major target from v19.
- v20 is LTS until 2026-11-28. After that date the one-major step from v19 is no longer supported by the release policy, so follow the Angular Update Guide for the path.

**Steps**

1. **Update to Angular v20.** Run `ng update @angular/core@20 @angular/cli@20` before 2026-11-28, then apply the v20 steps in the Angular Update Guide.
2. **Update to Angular v21.** After the v20 build and tests pass, run `ng update @angular/core@21 @angular/cli@21` and apply the v21 steps in the Angular Update Guide.
3. **Update to Angular v22.** After the v21 build and tests pass, run `ng update @angular/core@22 @angular/cli@22` and apply the v22 steps in the Angular Update Guide.

**Verification**

- `npm ls @angular/core`: Confirm that @angular/core resolves to the target major.
- `npm run build --if-present`: Build the application on the target major.
- `npm run test --if-present`: Run the unit tests when the project defines them.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.angular.core.v19.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html",
      "headline": "@angular/core v19 is no longer supported — dates, impact, migration",
      "description": "Angular's release schedule states that Angular versions v2 to v19 are no longer supported. v19 receives no fixes, including security fixes.",
      "inLanguage": "en",
      "dateModified": "2026-10-21",
      "keywords": [
        "end-of-support",
        "npm",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "@angular/core v19 is no longer supported",
        "identifier": "pkg:npm/%40angular/core"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Angular release and support schedule",
          "url": "https://angular.dev/reference/releases"
        },
        {
          "@type": "CreativeWork",
          "name": "Angular Update Guide",
          "url": "https://angular.dev/update-guide"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v19.end-of-support.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:npm/%40angular/core?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support. The source gives no day. Affected versions: vers:npm/>=19.0.0-0|\u003c20.0.0-0. Source: Angular release and support schedule (https://angular.dev/reference/releases)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:npm/%40angular/core?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "@angular/core@22"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:npm/%40angular/core?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:npm/%40angular/core."
          }
        }
      ]
    }
  ]
}
</script>
