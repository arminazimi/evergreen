---
title: "@angular/core v21 reaches end of life on 2027-06-30 — dates, impact, migration"
description: "Angular's release schedule lists v21 with \"LTS ends 2027-06\", a month-precision date. Evergreen uses the last day of that month, 2027-06-30, as the deadline."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v21.scheduled-end-of-life.html"
---

# @angular/core v21 reaches end of life on 2027-06-30

**Scheduled end of life** as of 2027-06-30. Replacement: @angular/core@22. Source: [Angular release and support schedule](https://angular.dev/reference/releases).

Check a version:

```bash
evergreen check pkg:npm/%40angular/core
```

Angular's release schedule lists v21 with "LTS ends 2027-06", a month-precision date. Evergreen uses the last day of that month, 2027-06-30, as the deadline. LTS receives only critical fixes and security patches until the end of that month.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Scheduled end of life |
| Severity | low |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40angular/core` |
| Affected versions | `vers:npm/>=21.0.0-0\|<22.0.0-0` |
| Date from the source | 2027-06-30 |
| Replacement | @angular/core@22 |
| Evidence last seen | 2026-10-24 |
| Reviewed | 2026-10-24 by arminazimi |
| Review due | 2027-10-24 (365 days after the last review) |
| Rule ID | `npm.package.angular.core.v21.scheduled-end-of-life` |

## Sources

- [Angular release and support schedule](https://angular.dev/reference/releases)
- [Angular Update Guide](https://angular.dev/update-guide)

## Migration

**Constraints**

- Update one major at a time. Each target major must be supported when you run ng update.
- Keep @angular/core, @angular/cli, and every other @angular/* package on the same major.

**Steps**

1. **Update to Angular v22.** Run `ng update @angular/core@22 @angular/cli@22`, then apply the v22 steps in the Angular Update Guide, including the required TypeScript and Node.js versions.
2. **Review changed Angular APIs.** Check each reported @angular/core import against the Angular Update Guide for removed, renamed, or changed APIs.

**Verification**

- `npm ls @angular/core`: Confirm that @angular/core resolves to the target major.
- `npm run build --if-present`: Build the application on the target major.
- `npm run test --if-present`: Run the unit tests when the project defines them.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.angular.core.v21.scheduled-end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v21.scheduled-end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v21.scheduled-end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v21.scheduled-end-of-life.html",
  "headline": "@angular/core v21 reaches end of life on 2027-06-30 — dates, impact, migration",
  "description": "Angular's release schedule lists v21 with \"LTS ends 2027-06\", a month-precision date. Evergreen uses the last day of that month, 2027-06-30, as the deadline.",
  "inLanguage": "en",
  "dateModified": "2026-10-24",
  "keywords": [
    "scheduled-end-of-life",
    "npm",
    "low"
  ],
  "about": {
    "@type": "Thing",
    "name": "@angular/core v21 reaches end of life on 2027-06-30",
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
