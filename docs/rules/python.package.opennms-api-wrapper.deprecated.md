---
title: "opennms-api-wrapper was renamed"
description: "The maintainer renamed opennms-api-wrapper to python-opennms and states that no further releases will be published under the old name."
---

# opennms-api-wrapper was renamed

The maintainer renamed opennms-api-wrapper to python-opennms and states that no further releases will be published under the old name.

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `python` |
| Component | `pkg:pypi/opennms-api-wrapper` |
| Affected versions | `vers:pypi/*` |
| Date from the source | The source gives no day |
| Replacement | python-opennms |
| Evidence last seen | 2026-10-16 |
| Reviewed | 2026-10-16 by arminazimi |
| Review due | 2027-10-16 (365 days after the last review) |
| Rule ID | `python.package.opennms-api-wrapper.deprecated` |

## Sources

- [opennms-api-wrapper rename notice](https://pypi.org/project/opennms-api-wrapper/)

## Migration

**Constraints**

- Preserve server URLs, authentication, timeout and TLS settings, resource queries, pagination, and response models.

**Steps**

1. **Replace the OpenNMS client.** Replace the distribution and migrate opennms_api_wrapper imports to the opennms module provided by python-opennms.

**Verification**

- `python -m pytest`: Run OpenNMS client and repository tests.

## Detected by

The `python` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/python.json`](https://github.com/arminazimi/evergreen/blob/main/registry/python.json), rule `python.package.opennms-api-wrapper.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/python.package.opennms-api-wrapper.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/python.package.opennms-api-wrapper.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/python.package.opennms-api-wrapper.deprecated.html",
  "headline": "opennms-api-wrapper was renamed",
  "description": "The maintainer renamed opennms-api-wrapper to python-opennms and states that no further releases will be published under the old name.",
  "inLanguage": "en",
  "dateModified": "2026-10-16",
  "keywords": [
    "deprecated",
    "python",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "opennms-api-wrapper was renamed",
    "identifier": "pkg:pypi/opennms-api-wrapper"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "opennms-api-wrapper rename notice",
      "url": "https://pypi.org/project/opennms-api-wrapper/"
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
