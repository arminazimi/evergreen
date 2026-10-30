---
title: "vue2-script-setup-transform is deprecated — dates, impact, migration"
description: "npm marks vue2-script-setup-transform as deprecated: \"renamed to `unplugin-vue2-script-setup`, see https://github.com/antfu/unplugin-vue2-script-setup/releases/tag/v0.4.0\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.vue2-script-setup-transform.deprecated.html"
json_twin: "/rules/npm.package.vue2-script-setup-transform.deprecated.json"
---

# vue2-script-setup-transform is deprecated

npm marks vue2-script-setup-transform as deprecated: "renamed to `unplugin-vue2-script-setup`, see https://github.com/antfu/unplugin-vue2-script-setup/releases/tag/v0.4.0"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/vue2-script-setup-transform` |
| Affected versions | `vers:npm/*` |
| Date from the source | The source gives no day |
| Replacement | unplugin-vue2-script-setup |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.vue2-script-setup-transform.deprecated` |

## Sources

- [vue2-script-setup-transform on npm](https://www.npmjs.com/package/vue2-script-setup-transform)
- [vue2-script-setup-transform registry metadata](https://registry.npmjs.org/vue2-script-setup-transform/latest)

## Migration

**Constraints**

- Preserve the compiled `<script setup>` output and the order of Vue 2 build plugins.

**Steps**

1. **Replace the transform plugin.** Replace vue2-script-setup-transform with unplugin-vue2-script-setup in dependencies and the build configuration.
2. **Verify compiled components.** Compare the compiled single-file components and their runtime behavior with the previous build.

**Verification**

- `npm run build --if-present`: Build the Vue 2 application with the maintained plugin.
- `npm run test --if-present`: Run the component and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.vue2-script-setup-transform.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.vue2-script-setup-transform.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.vue2-script-setup-transform.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.vue2-script-setup-transform.deprecated.html",
  "headline": "vue2-script-setup-transform is deprecated — dates, impact, migration",
  "description": "npm marks vue2-script-setup-transform as deprecated: \"renamed to `unplugin-vue2-script-setup`, see https://github.com/antfu/unplugin-vue2-script-setup/releases/tag/v0.4.0\"",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "vue2-script-setup-transform is deprecated",
    "identifier": "pkg:npm/vue2-script-setup-transform"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "vue2-script-setup-transform on npm",
      "url": "https://www.npmjs.com/package/vue2-script-setup-transform"
    },
    {
      "@type": "CreativeWork",
      "name": "vue2-script-setup-transform registry metadata",
      "url": "https://registry.npmjs.org/vue2-script-setup-transform/latest"
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
