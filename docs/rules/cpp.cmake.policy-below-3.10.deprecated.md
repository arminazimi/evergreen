---
title: "CMake policy versions older than 3.10 are deprecated — dates, impact, migration"
description: "CMake 3.31 deprecated compatibility with policy versions older than 3.10. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.10…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.10.deprecated.html"
---

# CMake policy versions older than 3.10 are deprecated

CMake 3.31 deprecated compatibility with policy versions older than 3.10. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.10 (optionally via ...<policy_max>) produces a deprecation warning on CMake 3.31 and newer. CMake 3.31.0 was published on 2024-11-06. Versions below 3.5 are covered by the removal rule instead.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `cpp` |
| Component | `pkg:generic/cmake` |
| Affected versions | `vers:semver/>=3.5.0\|<3.10.0` |
| Date from the source | 2024-11-06 |
| Replacement | cmake_minimum_required(VERSION 3.10) or newer, or VERSION <min>...<max> with <max> at least 3.10 |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-04-17 (180 days after the last review) |
| Rule ID | `cpp.cmake.policy-below-3.10.deprecated` |

## Sources

- [CMake 3.31 release notes (compatibility older than 3.10 deprecated)](https://cmake.org/cmake/help/latest/release/3.31.html)
- [cmake_minimum_required (Changed in 3.31)](https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html)

## Migration

**Constraints**

- Raising the policy version can change NEW policy behavior; read the policies introduced between the old and new floor before committing.

**Steps**

1. **Raise the reported cmake_minimum_required policy version.** Change the reported cmake_minimum_required(VERSION …) so the effective policy version is at least 3.10 (for example VERSION 3.16, or VERSION 3.5...3.16).

**Verification**

- `cmake -S . -B build -Wdev`: Configure with developer warnings enabled and confirm the policy-floor deprecation is gone.

## Detected by

No built-in detector reads `cpp` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json).

## Data

This page is generated from [`registry/cpp.json`](https://github.com/arminazimi/evergreen/blob/main/registry/cpp.json), rule `cpp.cmake.policy-below-3.10.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.10.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.10.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/cpp.cmake.policy-below-3.10.deprecated.html",
  "headline": "CMake policy versions older than 3.10 are deprecated — dates, impact, migration",
  "description": "CMake 3.31 deprecated compatibility with policy versions older than 3.10. A cmake_minimum_required(VERSION) or cmake_policy(VERSION) call that does not set the policy version to at least 3.10…",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "cpp",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "CMake policy versions older than 3.10 are deprecated",
    "identifier": "pkg:generic/cmake"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "CMake 3.31 release notes (compatibility older than 3.10 deprecated)",
      "url": "https://cmake.org/cmake/help/latest/release/3.31.html"
    },
    {
      "@type": "CreativeWork",
      "name": "cmake_minimum_required (Changed in 3.31)",
      "url": "https://cmake.org/cmake/help/latest/command/cmake_minimum_required.html"
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
