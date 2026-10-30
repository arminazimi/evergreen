---
title: "Event events.k8s.io/v1beta1 is no longer served — dates, impact, migration"
description: "The Kubernetes Deprecated API Migration Guide states that the events.k8s.io/v1beta1 API version of Event is no longer served as of v1.25, which was released on 2022-08-23."
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.events-k8s-io.event.v1beta1.removed.html"
json_twin: "/rules/kubernetes.events-k8s-io.event.v1beta1.removed.json"
---

# Event events.k8s.io/v1beta1 is no longer served

**Removed** as of 2022-08-23. Replacement: events.k8s.io/v1 Event, available since v1.19. Source: [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/).

Check a version:

```bash
evergreen check pkg:generic/kubernetes/events.k8s.io/Event
```

The Kubernetes Deprecated API Migration Guide states that the events.k8s.io/v1beta1 API version of Event is no longer served as of v1.25, which was released on 2022-08-23.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/events.k8s.io/Event` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2022-08-23 |
| Replacement | events.k8s.io/v1 Event, available since v1.19 |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `kubernetes.events-k8s-io.event.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes v1.25: Combiner (release announcement, 2022-08-23)](https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/)

## Migration

**Constraints**

- Keep the resource's behavior unchanged: the same name, namespace, labels, and spec semantics.
- The replacement (events.k8s.io/v1 Event, available since v1.19) can differ in required fields or field names from the removed version; read the Event entry in the Kubernetes Deprecated API Migration Guide and convert the manifest accordingly.

**Steps**

1. **Change the Event apiVersion.** Change the reported `apiVersion` to the replacement version (events.k8s.io/v1 Event, available since v1.19).
2. **Convert fields the new version changed.** Apply the field changes the migration guide lists for Event, then check the manifest still expresses the same intent.
3. **Align other Event declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old Event API version, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.events-k8s-io.event.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.events-k8s-io.event.v1beta1.removed.html",
  "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.events-k8s-io.event.v1beta1.removed.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.events-k8s-io.event.v1beta1.removed.html",
  "headline": "Event events.k8s.io/v1beta1 is no longer served — dates, impact, migration",
  "description": "The Kubernetes Deprecated API Migration Guide states that the events.k8s.io/v1beta1 API version of Event is no longer served as of v1.25, which was released on 2022-08-23.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "removed",
    "kubernetes",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Event events.k8s.io/v1beta1 is no longer served",
    "identifier": "pkg:generic/kubernetes/events.k8s.io/Event"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Kubernetes Deprecated API Migration Guide",
      "url": "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
    },
    {
      "@type": "CreativeWork",
      "name": "Kubernetes v1.25: Combiner (release announcement, 2022-08-23)",
      "url": "https://kubernetes.io/blog/2022/08/23/kubernetes-v1-25-release/"
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
