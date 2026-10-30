---
title: "pytest-runner is deprecated — dates, impact, migration"
description: "The maintainer warns that pytest-runner depends on deprecated Setuptools features and can bypass pip security mechanisms."
canonical_url: "https://arminazimi.github.io/evergreen/rules/python.package.pytest-runner.deprecated.html"
json_twin: "/rules/python.package.pytest-runner.deprecated.json"
---

# pytest-runner is deprecated

The maintainer warns that pytest-runner depends on deprecated Setuptools features and can bypass pip security mechanisms.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `python` |
| Component | `pkg:pypi/pytest-runner` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | tox, nox, or direct pytest invocation |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.pytest-runner.deprecated` |

## Sources

- [pytest-runner deprecation notice](https://pypi.org/project/pytest-runner/)

## Migration

**Constraints**

- Preserve test dependencies, pytest options, environment variables, supported Python versions, and CI exit behavior.

**Steps**

1. **Remove pytest-runner.** Remove pytest-runner from setup requirements and move test dependencies out of tests_require.
2. **Add an explicit test runner.** Configure tox, nox, or the existing environment manager to install test dependencies and invoke pytest directly.

**Verification**

- `python -m pytest`: Run the test suite without setup.py test or pytest-runner.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.pytest-runner.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.pytest-runner.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.pytest-runner.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.pytest-runner.deprecated.html",
  "headline": "pytest-runner is deprecated — dates, impact, migration",
  "description": "The maintainer warns that pytest-runner depends on deprecated Setuptools features and can bypass pip security mechanisms.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "pytest-runner is deprecated",
    "identifier": "pkg:pypi/pytest-runner"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "pytest-runner deprecation notice",
      "url": "https://pypi.org/project/pytest-runner/"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/python.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
