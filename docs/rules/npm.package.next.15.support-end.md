---
title: "Next.js 15 is out of support — dates, impact, migration"
description: "Next.js 15 was released on 2024-10-21. The support policy keeps each major in Maintenance LTS for two years after release, so its window ended on 2026-10-21; the policy page still listed 15.x under…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.next.15.support-end.html"
---

# Next.js 15 is out of support

Next.js 15 was released on 2024-10-21. The support policy keeps each major in Maintenance LTS for two years after release, so its window ended on 2026-10-21; the policy page still listed 15.x under Supported Versions on 2026-10-25. Next.js 16 is the Active LTS release.

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/next` |
| Affected versions | `vers:npm/>=15.0.0\|<16.0.0` |
| Date from the source | 2026-10-21 |
| Replacement | Next.js 16 (Active LTS) |
| Evidence last seen | 2026-10-25 |
| Reviewed | 2026-10-25 by arminazimi |
| Review due | 2027-10-25 (365 days after the last review) |
| Rule ID | `npm.package.next.15.support-end` |

## Sources

- [Next.js support policy](https://nextjs.org/support-policy)
- [Next.js upgrade guide: version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)

## Migration

**Constraints**

- Preserve the routes, rendering modes, data fetching, and public behavior of the application; change only what the Next.js 16 upgrade guide requires.

**Steps**

1. **Move next to a supported major.** Set the next dependency to the Active LTS release (16.x) in the package.json that declares it, then align react and react-dom with the versions the guides require. The 15 guide requires React 19.
2. **Apply the upgrade guides in order.** Work through the official upgrade guides for 16, one major at a time, and resolve each breaking change they list before starting the next. Check the Node.js minimum each guide states.
3. **Run the official codemods.** Run the codemods the guides name (for example the upgrade codemod from @next/codemod) or make the same changes by hand, and review every change before committing.
4. **Replace renamed or removed APIs.** Replace the imports, components, and configuration options that the guides rename or remove, such as the target option removed in Next.js 13 and next lint removed in Next.js 16.

**Verification**

- `npm run build --if-present`: Build the application with the upgraded Next.js.
- `npm run test --if-present`: Run the repository tests when defined.
- `npm run lint --if-present`: Lint with the ESLint CLI; the next lint command is removed in Next.js 16.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.next.15.support-end`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.next.15.support-end.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.next.15.support-end.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.next.15.support-end.html",
  "headline": "Next.js 15 is out of support — dates, impact, migration",
  "description": "Next.js 15 was released on 2024-10-21. The support policy keeps each major in Maintenance LTS for two years after release, so its window ended on 2026-10-21; the policy page still listed 15.x under…",
  "inLanguage": "en",
  "dateModified": "2026-10-25",
  "keywords": [
    "end-of-support",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Next.js 15 is out of support",
    "identifier": "pkg:npm/next"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Next.js support policy",
      "url": "https://nextjs.org/support-policy"
    },
    {
      "@type": "CreativeWork",
      "name": "Next.js upgrade guide: version 16",
      "url": "https://nextjs.org/docs/app/guides/upgrading/version-16"
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
