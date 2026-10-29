---
title: "@angular/core v22 reaches end of life on 2028-06-30 — dates, impact, migration"
description: "Angular's release schedule lists v22 with \"LTS ends 2028-06\", a month-precision date. Evergreen uses the last day of that month, 2028-06-30, as the deadline."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v22.scheduled-end-of-life.html"
---

# @angular/core v22 reaches end of life on 2028-06-30

Angular's release schedule lists v22 with "LTS ends 2028-06", a month-precision date. Evergreen uses the last day of that month, 2028-06-30, as the deadline. LTS receives only critical fixes and security patches until the end of that month.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40angular/core` |
| Affected versions | `vers:npm/>=22.0.0-0\|<23.0.0-0` |
| Date from the source | 2028-06-30 |
| Evidence last seen | 2026-10-24 |
| Reviewed | 2026-10-24 by arminazimi |
| Review due | 2027-10-24 (365 days after the last review) |
| Rule ID | `npm.package.angular.core.v22.scheduled-end-of-life` |

## Sources

- [Angular release and support schedule](https://angular.dev/reference/releases)
- [Angular Update Guide](https://angular.dev/update-guide)

## Migration

**Constraints**

- Update one major at a time. Each target major must be supported when you run ng update.
- Keep @angular/core, @angular/cli, and every other @angular/* package on the same major.

**Steps**

1. **Plan the update to the next Angular major.** When a newer major than v22 is published, run `ng update @angular/core@<major> @angular/cli@<major>` for it and apply its steps in the Angular Update Guide.
2. **Review changed Angular APIs.** Check each reported @angular/core import against the Angular Update Guide for removed, renamed, or changed APIs.

**Verification**

- `npm ls @angular/core`: Confirm that @angular/core resolves to the target major.
- `npm run build --if-present`: Build the application on the target major.
- `npm run test --if-present`: Run the unit tests when the project defines them.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.angular.core.v22.scheduled-end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v22.scheduled-end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v22.scheduled-end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v22.scheduled-end-of-life.html",
  "headline": "@angular/core v22 reaches end of life on 2028-06-30 — dates, impact, migration",
  "description": "Angular's release schedule lists v22 with \"LTS ends 2028-06\", a month-precision date. Evergreen uses the last day of that month, 2028-06-30, as the deadline.",
  "inLanguage": "en",
  "dateModified": "2026-10-24",
  "keywords": [
    "scheduled-end-of-life",
    "npm",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "@angular/core v22 reaches end of life on 2028-06-30",
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
}
</script>
