---
title: "CMake policy versions older than 3.5 are removed — dates, impact, migration"
description: "CMake 4.0 removed compatibility with policy versions older than 3.5. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.5 (optionally…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.5.removed.html"
---

# CMake policy versions older than 3.5 are removed

CMake 4.0 removed compatibility with policy versions older than 3.5. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.5 (optionally via ...&lt;policy_max&gt;) produces an error on CMake 4.0 and newer. CMake 4.0.0 was published on 2025-03-27.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `cpp` |
| Component | `pkg:generic/cmake` |
| Affected versions | `vers:semver/<3.5.0` |
| Date from the source | 2025-03-27 |
| Replacement | cmake_minimum_required(VERSION 3.5) or newer, or VERSION &lt;min&gt;...&lt;max&gt; with &lt;max&gt; at least 3.5 |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-04-17 (180 days after the last review) |
| Rule ID | `cpp.cmake.policy-below-3.5.removed` |

## Sources

- [CMake 4.0 release notes (compatibility older than 3.5 removed)](https://cmake.org/cmake/help/latest/release/4.0.html)
- [cmake_minimum_required (Changed in 4.0)](https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html)
- [CMake 4.0.0 GitHub release](https://github.com/Kitware/CMake/releases/tag/v4.0.0)

## Migration

**Constraints**

- Raising the policy version can change NEW policy behavior; read the policies introduced between the old and new floor before committing.
- Projects that must still configure on older CMake can use VERSION &lt;min&gt;...&lt;max&gt; so the minimum stays low while the policy max is at least 3.5 on newer CMake.

**Steps**

1. **Raise the reported cmake_minimum_required policy version.** Change the reported cmake_minimum_required(VERSION …) so the effective policy version is at least 3.5 (for example VERSION 3.16, or VERSION 2.8.12...3.16).

**Verification**

- `cmake -S . -B build`: Configure the project with a CMake 4.x toolchain and confirm the policy floor is accepted.

## Detected by

The `cpp` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/cpp.json`](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json), rule `cpp.cmake.policy-below-3.5.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.5.removed.html",
  "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.5.removed.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.5.removed.html",
  "headline": "CMake policy versions older than 3.5 are removed — dates, impact, migration",
  "description": "CMake 4.0 removed compatibility with policy versions older than 3.5. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.5 (optionally…",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "removed",
    "cpp",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "CMake policy versions older than 3.5 are removed",
    "identifier": "pkg:generic/cmake"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "CMake 4.0 release notes (compatibility older than 3.5 removed)",
      "url": "https://cmake.org/cmake/help/latest/release/4.0.html"
    },
    {
      "@type": "CreativeWork",
      "name": "cmake_minimum_required (Changed in 4.0)",
      "url": "https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html"
    },
    {
      "@type": "CreativeWork",
      "name": "CMake 4.0.0 GitHub release",
      "url": "https://github.com/Kitware/CMake/releases/tag/v4.0.0"
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
