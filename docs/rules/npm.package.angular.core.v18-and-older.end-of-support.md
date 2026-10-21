---
title: "@angular/core v18 and older are no longer supported — dates, impact, migration"
description: "Angular's release schedule states that Angular versions v2 to v19 are no longer supported. Versions before v19 receive no fixes, including security fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v18-and-older.end-of-support.html"
---

# @angular/core v18 and older are no longer supported

Angular's release schedule states that Angular versions v2 to v19 are no longer supported. Versions before v19 receive no fixes, including security fixes.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/%40angular/core` |
| Affected versions | `vers:npm/<19.0.0-0` |
| Date from the source | The source gives no day |
| Replacement | @angular/core@22 |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by arminazimi |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `npm.package.angular.core.v18-and-older.end-of-support` |

## Sources

- [Angular release and support schedule](https://angular.dev/reference/releases)
- [Angular Update Guide](https://angular.dev/update-guide)

## Migration

**Constraints**

- ng update accepts only a supported target major, and v19 is no longer supported, so no single ng update step from v18 or older reaches a supported major.
- Use the Angular Update Guide to plan each step, and do not skip majors without it.

**Steps**

1. **Plan the update path.** Read the Angular Update Guide for this version and list each intermediate major that the guide requires, ending at v22 (Active) or v21 (LTS). Record the Node.js and TypeScript versions each step needs.
2. **Update one major at a time.** Run `ng update @angular/core@<next> @angular/cli@<next>` for each planned major, and apply that major's steps in the Angular Update Guide. Verify each step before the next.

**Verification**

- `npm ls @angular/core`: Confirm that @angular/core resolves to the target major.
- `npm run build --if-present`: Build the application on the target major.
- `npm run test --if-present`: Run the unit tests when the project defines them.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.angular.core.v18-and-older.end-of-support`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v18-and-older.end-of-support.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v18-and-older.end-of-support.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.angular.core.v18-and-older.end-of-support.html",
  "headline": "@angular/core v18 and older are no longer supported — dates, impact, migration",
  "description": "Angular's release schedule states that Angular versions v2 to v19 are no longer supported. Versions before v19 receive no fixes, including security fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-support",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "@angular/core v18 and older are no longer supported",
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
