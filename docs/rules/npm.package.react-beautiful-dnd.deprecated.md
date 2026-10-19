---
title: "react-beautiful-dnd is deprecated — dates, impact, migration"
description: "npm marks react-beautiful-dnd as deprecated: \"react-beautiful-dnd is now deprecated. Context and options: https://github.com/atlassian/react-beautiful-dnd/issues/2672\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.react-beautiful-dnd.deprecated.html"
---

# react-beautiful-dnd is deprecated

npm marks react-beautiful-dnd as deprecated: "react-beautiful-dnd is now deprecated. Context and options: https://github.com/atlassian/react-beautiful-dnd/issues/2672"

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/react-beautiful-dnd` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | Pragmatic drag and drop, dnd-kit, or a maintained fork |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.react-beautiful-dnd.deprecated` |

## Sources

- [react-beautiful-dnd on npm](https://www.npmjs.com/package/react-beautiful-dnd)
- [react-beautiful-dnd registry metadata](https://registry.npmjs.org/react-beautiful-dnd/latest)
- [react-beautiful-dnd deprecation announcement](https://github.com/atlassian/react-beautiful-dnd/issues/2672)

## Migration

**Constraints**

- Preserve drag behavior, keyboard and screen-reader support, droppable ids, and the rendered structure each screen depends on.

**Steps**

1. **Choose the replacement.** Pick Pragmatic drag and drop, its react-beautiful-dnd migration package, dnd-kit, or a maintained fork based on the behaviors each screen uses.
2. **Migrate the drag-and-drop components.** Rewrite DragDropContext, Droppable, and Draggable usages for the replacement, keeping droppable ids stable where persisted state refers to them.

**Verification**

- `npm run test --if-present`: Run drag-and-drop interaction and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.react-beautiful-dnd.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.react-beautiful-dnd.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.react-beautiful-dnd.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.react-beautiful-dnd.deprecated.html",
  "headline": "react-beautiful-dnd is deprecated — dates, impact, migration",
  "description": "npm marks react-beautiful-dnd as deprecated: \"react-beautiful-dnd is now deprecated. Context and options: https://github.com/atlassian/react-beautiful-dnd/issues/2672\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "react-beautiful-dnd is deprecated",
    "identifier": "pkg:npm/react-beautiful-dnd"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "react-beautiful-dnd on npm",
      "url": "https://www.npmjs.com/package/react-beautiful-dnd"
    },
    {
      "@type": "CreativeWork",
      "name": "react-beautiful-dnd registry metadata",
      "url": "https://registry.npmjs.org/react-beautiful-dnd/latest"
    },
    {
      "@type": "CreativeWork",
      "name": "react-beautiful-dnd deprecation announcement",
      "url": "https://github.com/atlassian/react-beautiful-dnd/issues/2672"
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
