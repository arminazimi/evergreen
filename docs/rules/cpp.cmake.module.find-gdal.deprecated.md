---
title: "The FindGDAL module is deprecated — dates, impact, migration"
description: "CMake 4.0 deprecated the FindGDAL module in favor of upstream GDAL's official CMake package configuration file. Projects should call find_package(GDAL CONFIG) instead."
canonical_url: "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.find-gdal.deprecated.html"
---

# The FindGDAL module is deprecated

**Deprecated** as of 2025-03-27. Replacement: find_package(GDAL CONFIG) using GDAL's upstream CMake package. Source: [CMake 4.0 release notes (FindGDAL deprecated)](https://cmake.org/cmake/help/latest/release/4.0.html).

Check a version:

```bash
evergreen check pkg:generic/cmake-module/find-gdal
```

CMake 4.0 deprecated the FindGDAL module in favor of upstream GDAL's official CMake package configuration file. Projects should call find_package(GDAL CONFIG) instead. CMake 4.0.0 was published on 2025-03-27.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `cpp` |
| Component | `pkg:generic/cmake-module/find-gdal` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2025-03-27 |
| Replacement | find_package(GDAL CONFIG) using GDAL's upstream CMake package |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-04-17 (180 days after the last review) |
| Rule ID | `cpp.cmake.module.find-gdal.deprecated` |

## Sources

- [CMake 4.0 release notes (FindGDAL deprecated)](https://cmake.org/cmake/help/latest/release/4.0.html)
- [FindGDAL module documentation](https://cmake.org/cmake/help/latest/module/FindGDAL.html)

## Migration

**Constraints**

- Confirm the GDAL install that the project uses ships a CONFIG package before dropping FindGDAL.
- Target and variable names may differ between FindGDAL and the upstream CONFIG package; update link lines to match.

**Steps**

1. **Switch to find_package(GDAL CONFIG).** Replace find_package(GDAL) / include(FindGDAL) with find_package(GDAL CONFIG) and link the imported targets the upstream package exports.

**Verification**

- `cmake -S . -B build && cmake --build build`: Configure and build after the GDAL find_package change.

## Detected by

The `cpp` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/cpp.json`](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json), rule `cpp.cmake.module.find-gdal.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.find-gdal.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.find-gdal.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.find-gdal.deprecated.html",
  "headline": "The FindGDAL module is deprecated — dates, impact, migration",
  "description": "CMake 4.0 deprecated the FindGDAL module in favor of upstream GDAL's official CMake package configuration file. Projects should call find_package(GDAL CONFIG) instead.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "cpp",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "The FindGDAL module is deprecated",
    "identifier": "pkg:generic/cmake-module/find-gdal"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "CMake 4.0 release notes (FindGDAL deprecated)",
      "url": "https://cmake.org/cmake/help/latest/release/4.0.html"
    },
    {
      "@type": "CreativeWork",
      "name": "FindGDAL module documentation",
      "url": "https://cmake.org/cmake/help/latest/module/FindGDAL.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
