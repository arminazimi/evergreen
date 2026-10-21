---
title: "Vue 2 is end-of-life — dates, impact, migration"
description: "Vue 2 has reached end of life and is no longer actively maintained. After December 31st, 2023 it receives no updates, including security and browser compatibility fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.vue.eol-2.html"
---

# Vue 2 is end-of-life

Vue 2 has reached end of life and is no longer actively maintained. After December 31st, 2023 it receives no updates, including security and browser compatibility fixes.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `npm` |
| Component | `pkg:npm/vue` |
| Affected versions | `vers:npm/>=2.0.0\|<3.0.0` |
| Date from the source | 2023-12-31 |
| Replacement | Vue 3 (vue@^3), following the Vue 3 migration guide |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-21 by kilo |
| Review due | 2027-10-21 (365 days after the last review) |
| Rule ID | `npm.package.vue.eol-2` |

## Sources

- [Vue 2 LTS, EOL & Extended Support](https://v2.vuejs.org/lts/)
- [Vue 3 Migration Guide](https://v3-migration.vuejs.org/)
- [Vue 3 Migration Guide: Migration Build](https://v3-migration.vuejs.org/migration-build.html)
- [Vue 3 Migration Guide: Breaking Changes](https://v3-migration.vuejs.org/breaking-changes/)
- [Vue 3 Migration Guide: Global API](https://v3-migration.vuejs.org/breaking-changes/global-api.html)

## Migration

**Constraints**

- Preserve the behavior the application depends on, and check each Vue 2 behavior listed in the Vue 3 breaking changes against the reported files.
- Keep a single Vue runtime in the build: when the project uses vue-template-compiler, replace it with @vue/compiler-sfc.

**Steps**

1. **Choose the upgrade path.** Upgrade straight to Vue 3, or install @vue/compat at the same version as vue and alias vue to it to run Vue 2 compatible behavior first. vue-cli projects can run vue upgrade to update @vue/cli-service.
2. **Update the Vue dependencies.** Set vue to a 3.x version in dependencies, and replace vue-template-compiler with @vue/compiler-sfc in devDependencies when present. Custom webpack setups upgrade vue-loader to ^16.0.0.
3. **Replace the Vue 2 global API.** At each reported import, replace new Vue() root instances with createApp() and move global configuration onto the application instance.
4. **Clear migration build warnings.** Build and run the application, fix each compatibility warning until none remain, then remove @vue/compat and switch the compiler to Vue 3 mode.

**Verification**

- `npm ls vue`: Confirm that one Vue 3 release resolves and no Vue 2 copy remains.
- `npm run build --if-present`: Compile the application and surface any remaining compiler warnings.
- `npm test --if-present`: Run the repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.vue.eol-2`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.vue.eol-2.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.vue.eol-2.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.vue.eol-2.html",
  "headline": "Vue 2 is end-of-life — dates, impact, migration",
  "description": "Vue 2 has reached end of life and is no longer actively maintained. After December 31st, 2023 it receives no updates, including security and browser compatibility fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-21",
  "keywords": [
    "end-of-life",
    "npm",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Vue 2 is end-of-life",
    "identifier": "pkg:npm/vue"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Vue 2 LTS, EOL & Extended Support",
      "url": "https://v2.vuejs.org/lts/"
    },
    {
      "@type": "CreativeWork",
      "name": "Vue 3 Migration Guide",
      "url": "https://v3-migration.vuejs.org/"
    },
    {
      "@type": "CreativeWork",
      "name": "Vue 3 Migration Guide: Migration Build",
      "url": "https://v3-migration.vuejs.org/migration-build.html"
    },
    {
      "@type": "CreativeWork",
      "name": "Vue 3 Migration Guide: Breaking Changes",
      "url": "https://v3-migration.vuejs.org/breaking-changes/"
    },
    {
      "@type": "CreativeWork",
      "name": "Vue 3 Migration Guide: Global API",
      "url": "https://v3-migration.vuejs.org/breaking-changes/global-api.html"
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
