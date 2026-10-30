---
title: "FlowSchema flowcontrol.apiserver.k8s.io/v1beta1 is no longer served — dates, impact, migration"
description: "The Kubernetes Deprecated API Migration Guide states that the flowcontrol.apiserver.k8s.io/v1beta1 API version of FlowSchema is no longer served as of v1.26, which was released on 2022-12-09."
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html"
image: "/assets/og/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.svg"
json_twin: "/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.json"
---

# FlowSchema flowcontrol.apiserver.k8s.io/v1beta1 is no longer served

**Removed** as of 2022-12-09. Replacement: flowcontrol.apiserver.k8s.io/v1beta2 FlowSchema. Source: [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/).

Check a version:

```bash
evergreen check pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema
```

The Kubernetes Deprecated API Migration Guide states that the flowcontrol.apiserver.k8s.io/v1beta1 API version of FlowSchema is no longer served as of v1.26, which was released on 2022-12-09.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2022-12-09 |
| Replacement | flowcontrol.apiserver.k8s.io/v1beta2 FlowSchema |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes v1.26: Electrifying (release announcement, 2022-12-09)](https://kubernetes.io/blog/2022/12/09/kubernetes-v1-26-release/)

## Migration

**Constraints**

- Keep the resource's behavior unchanged: the same name, namespace, labels, and spec semantics.
- The replacement (flowcontrol.apiserver.k8s.io/v1beta2 FlowSchema) can differ in required fields or field names from the removed version; read the FlowSchema entry in the Kubernetes Deprecated API Migration Guide and convert the manifest accordingly.

**Steps**

1. **Change the FlowSchema apiVersion.** Change the reported `apiVersion` to the replacement version (flowcontrol.apiserver.k8s.io/v1beta2 FlowSchema).
2. **Convert fields the new version changed.** Apply the field changes the migration guide lists for FlowSchema, then check the manifest still expresses the same intent.
3. **Align other FlowSchema declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old FlowSchema API version, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html",
      "headline": "FlowSchema flowcontrol.apiserver.k8s.io/v1beta1 is no longer served — dates, impact, migration",
      "description": "The Kubernetes Deprecated API Migration Guide states that the flowcontrol.apiserver.k8s.io/v1beta1 API version of FlowSchema is no longer served as of v1.26, which was released on 2022-12-09.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "removed",
        "kubernetes",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "FlowSchema flowcontrol.apiserver.k8s.io/v1beta1 is no longer served",
        "identifier": "pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Kubernetes Deprecated API Migration Guide",
          "url": "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
        },
        {
          "@type": "CreativeWork",
          "name": "Kubernetes v1.26: Electrifying (release announcement, 2022-12-09)",
          "url": "https://kubernetes.io/blog/2022/12/09/kubernetes-v1-26-release/"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.flowcontrol-apiserver-k8s-io.flowschema.v1beta1.removed.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed as of 2022-12-09. Affected versions: vers:semver/1.0.0-beta.1. Source: Kubernetes Deprecated API Migration Guide (https://kubernetes.io/docs/reference/using-api/deprecation-guide/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "flowcontrol.apiserver.k8s.io/v1beta2 FlowSchema"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/kubernetes/flowcontrol.apiserver.k8s.io/FlowSchema."
          }
        }
      ]
    }
  ]
}
</script>
