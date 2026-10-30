---
title: "The Visual Studio 12 2013 generator is removed — dates, impact, migration"
description: "CMake 3.31 removed the Visual Studio 12 2013 generator. Projects and presets that still name that generator cannot configure on CMake 3.31 or newer. CMake 3.31.0 was published on 2024-11-06."
canonical_url: "https://arminazimi.github.io/evergreen/rules/cpp.cmake.generator.visual-studio-12-2013.removed.html"
json_twin: "/rules/cpp.cmake.generator.visual-studio-12-2013.removed.json"
---

# The Visual Studio 12 2013 generator is removed

**Removed** as of 2024-11-06. Replacement: A still-supported Visual Studio generator, such as Visual Studio 17 2022. Source: [CMake 3.31 release notes (Visual Studio 12 2013 generator removed)](https://cmake.org/cmake/help/latest/release/3.31.html).

Check a version:

```bash
evergreen check pkg:generic/cmake-generator/visual-studio-12-2013
```

CMake 3.31 removed the Visual Studio 12 2013 generator. Projects and presets that still name that generator cannot configure on CMake 3.31 or newer. CMake 3.31.0 was published on 2024-11-06.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `cpp` |
| Component | `pkg:generic/cmake-generator/visual-studio-12-2013` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2024-11-06 |
| Replacement | A still-supported Visual Studio generator, such as Visual Studio 17 2022 |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-04-17 (180 days after the last review) |
| Rule ID | `cpp.cmake.generator.visual-studio-12-2013.removed` |

## Sources

- [CMake 3.31 release notes (Visual Studio 12 2013 generator removed)](https://cmake.org/cmake/help/latest/release/3.31.html)
- [Visual Studio 12 2013 generator documentation](https://cmake.org/cmake/help/latest/generator/Visual%20Studio%2012%202013.html)

## Migration

**Constraints**

- Update CMake presets, CI matrix generator names, and documented configure commands together so every surface names the same supported generator.

**Steps**

1. **Replace the Visual Studio 12 2013 generator.** Change every reported generator name from Visual Studio 12 2013 to a supported Visual Studio generator installed on the build hosts.

**Verification**

- `cmake -G "Visual Studio 17 2022" -S . -B build`: Configure with a supported Visual Studio generator.

## Detected by

The `cpp` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/cpp.json`](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json), rule `cpp.cmake.generator.visual-studio-12-2013.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.generator.visual-studio-12-2013.removed.html",
  "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.generator.visual-studio-12-2013.removed.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.generator.visual-studio-12-2013.removed.html",
  "headline": "The Visual Studio 12 2013 generator is removed — dates, impact, migration",
  "description": "CMake 3.31 removed the Visual Studio 12 2013 generator. Projects and presets that still name that generator cannot configure on CMake 3.31 or newer. CMake 3.31.0 was published on 2024-11-06.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "removed",
    "cpp",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "The Visual Studio 12 2013 generator is removed",
    "identifier": "pkg:generic/cmake-generator/visual-studio-12-2013"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "CMake 3.31 release notes (Visual Studio 12 2013 generator removed)",
      "url": "https://cmake.org/cmake/help/latest/release/3.31.html"
    },
    {
      "@type": "CreativeWork",
      "name": "Visual Studio 12 2013 generator documentation",
      "url": "https://cmake.org/cmake/help/latest/generator/Visual%20Studio%2012%202013.html"
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
