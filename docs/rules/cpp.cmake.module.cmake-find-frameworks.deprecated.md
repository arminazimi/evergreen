---
title: "The CMakeFindFrameworks module is deprecated — dates, impact, migration"
description: "CMake 3.31 deprecated the CMakeFindFrameworks module via policy CMP0173. Projects should use find_library() instead. CMake 3.31.0 was published on 2024-11-06."
canonical_url: "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html"
json_twin: "/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.json"
---

# The CMakeFindFrameworks module is deprecated

**Deprecated** as of 2024-11-06. Replacement: find_library(). Source: [CMake 3.31 release notes (CMakeFindFrameworks deprecated)](https://cmake.org/cmake/help/latest/release/3.31.html).

Check a version:

```bash
evergreen check pkg:generic/cmake-module/cmake-find-frameworks
```

CMake 3.31 deprecated the CMakeFindFrameworks module via policy CMP0173. Projects should use find_library() instead. CMake 3.31.0 was published on 2024-11-06.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `cpp` |
| Component | `pkg:generic/cmake-module/cmake-find-frameworks` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2024-11-06 |
| Replacement | find_library() |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-04-17 (180 days after the last review) |
| Rule ID | `cpp.cmake.module.cmake-find-frameworks.deprecated` |

## Sources

- [CMake 3.31 release notes (CMakeFindFrameworks deprecated)](https://cmake.org/cmake/help/latest/release/3.31.html)
- [CMakeFindFrameworks module documentation](https://cmake.org/cmake/help/latest/module/CMakeFindFrameworks.html)

## Migration

**Constraints**

- Preserve the framework search paths and the library names the project already expects when rewriting calls to find_library().

**Steps**

1. **Replace CMakeFindFrameworks with find_library.** Remove include(CMakeFindFrameworks) / cmake_find_frameworks() and locate the same frameworks with find_library().

**Verification**

- `cmake -S . -B build -Wdev`: Configure with developer warnings and confirm the CMP0173 deprecation is gone.

## Detected by

The `cpp` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [The Visual Studio 12 2013 generator is removed](cpp.cmake.generator.visual-studio-12-2013.removed.html)
- [The FindGDAL module is deprecated](cpp.cmake.module.find-gdal.deprecated.html)
- [CMake policy versions older than 3.10 are deprecated](cpp.cmake.policy-below-3.10.deprecated.html)
- [CMake policy versions older than 3.5 are removed](cpp.cmake.policy-below-3.5.removed.html)


## Data

This page is generated from [`registry/cpp.json`](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json), rule `cpp.cmake.module.cmake-find-frameworks.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html",
      "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html",
      "headline": "The CMakeFindFrameworks module is deprecated — dates, impact, migration",
      "description": "CMake 3.31 deprecated the CMakeFindFrameworks module via policy CMP0173. Projects should use find_library() instead. CMake 3.31.0 was published on 2024-11-06.",
      "inLanguage": "en",
      "dateModified": "2026-10-19",
      "keywords": [
        "deprecated",
        "cpp",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "The CMakeFindFrameworks module is deprecated",
        "identifier": "pkg:generic/cmake-module/cmake-find-frameworks"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "CMake 3.31 release notes (CMakeFindFrameworks deprecated)",
          "url": "https://cmake.org/cmake/help/latest/release/3.31.html"
        },
        {
          "@type": "CreativeWork",
          "name": "CMakeFindFrameworks module documentation",
          "url": "https://cmake.org/cmake/help/latest/module/CMakeFindFrameworks.html"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.module.cmake-find-frameworks.deprecated.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/cmake-module/cmake-find-frameworks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated as of 2024-11-06. Affected versions: vers:semver/*. Source: CMake 3.31 release notes (CMakeFindFrameworks deprecated) (https://cmake.org/cmake/help/latest/release/3.31.html)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/cmake-module/cmake-find-frameworks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "find_library()"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/cmake-module/cmake-find-frameworks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/cmake-module/cmake-find-frameworks."
          }
        }
      ]
    }
  ]
}
</script>
