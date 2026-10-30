---
title: "Helm incubator chart repository is end of life — dates, impact, migration"
description: "The Helm project retired the incubator chart repository with the same timeline as stable: on 2020-11-13 CI was disabled and no further pull requests were accepted, and downloads were redirected to a…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.helm.repository.incubator.end-of-life.html"
json_twin: "/rules/kubernetes.helm.repository.incubator.end-of-life.json"
---

# Helm incubator chart repository is end of life

**End of life** as of 2020-11-13. Replacement: The chart's new maintained repository (see Helm's stable-repo-charts-new-locations list), or adopt the chart yourself. Source: [Helm Chart Repository Deprecation Update (2020-10-30)](https://helm.sh/blog/charts-repo-deprecation/).

Check a version:

```bash
evergreen check pkg:generic/helm-repository/incubator
```

The Helm project retired the incubator chart repository with the same timeline as stable: on 2020-11-13 CI was disabled and no further pull requests were accepted, and downloads were redirected to a read-only archive that receives no bug fixes or security patches. The Helm Chart Repository Deprecation Update states those dates and recommended actions.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/helm-repository/incubator` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2020-11-13 |
| Replacement | The chart's new maintained repository (see Helm's stable-repo-charts-new-locations list), or adopt the chart yourself |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-10-26 (365 days after the last review) |
| Rule ID | `kubernetes.helm.repository.incubator.end-of-life` |

## Sources

- [Helm Chart Repository Deprecation Update (2020-10-30)](https://helm.sh/blog/charts-repo-deprecation/)
- [Helm community: stable repository charts — new locations](https://github.com/helm/community/blob/main/stable-repo-charts-new-locations.md)

## Migration

**Constraints**

- Replace only Chart.yaml dependencies whose repository is the retired incubator URL (https://charts.helm.sh/incubator or https://kubernetes-charts-incubator.storage.googleapis.com).
- Look up the chart name in Helm's relocation lists for the maintainer's new repository; if none exists, consider adopting the chart rather than pinning the archive.

**Steps**

1. **Point the dependency at a maintained repository.** Change the reported dependency's repository URL to the chart's new location from the relocation list (or another maintainer-published repository), and set version to a release published there.
2. **Align other Chart.yaml dependencies.** Update every other Chart.yaml dependency that still names the retired incubator repository URL.

**Verification**

- `helm dependency update <chart-path>`: Fetch the dependency from the new repository and refresh Chart.lock.
- `helm template <chart-path> | kubeconform -strict -`: Render the chart and validate the output against Kubernetes schemas.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.helm.repository.incubator.end-of-life`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.helm.repository.incubator.end-of-life.html",
  "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.helm.repository.incubator.end-of-life.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.helm.repository.incubator.end-of-life.html",
  "headline": "Helm incubator chart repository is end of life — dates, impact, migration",
  "description": "The Helm project retired the incubator chart repository with the same timeline as stable: on 2020-11-13 CI was disabled and no further pull requests were accepted, and downloads were redirected to a…",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "end-of-life",
    "kubernetes",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Helm incubator chart repository is end of life",
    "identifier": "pkg:generic/helm-repository/incubator"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Helm Chart Repository Deprecation Update (2020-10-30)",
      "url": "https://helm.sh/blog/charts-repo-deprecation/"
    },
    {
      "@type": "CreativeWork",
      "name": "Helm community: stable repository charts — new locations",
      "url": "https://github.com/helm/community/blob/main/stable-repo-charts-new-locations.md"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
