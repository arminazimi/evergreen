---
title: "LocalSubjectAccessReview authorization.k8s.io/v1beta1 is no longer served — dates, impact, migration"
description: "The Kubernetes Deprecated API Migration Guide states that the authorization.k8s.io/v1beta1 API version of LocalSubjectAccessReview is no longer served as of v1.22, which was released on 2021-08-04."
canonical_url: "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html"
json_twin: "/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.json"
---

# LocalSubjectAccessReview authorization.k8s.io/v1beta1 is no longer served

**Removed** as of 2021-08-04. Replacement: authorization.k8s.io/v1 LocalSubjectAccessReview, available since v1.6. Source: [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/).

Check a version:

```bash
evergreen check pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview
```

The Kubernetes Deprecated API Migration Guide states that the authorization.k8s.io/v1beta1 API version of LocalSubjectAccessReview is no longer served as of v1.22, which was released on 2021-08-04.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Removed |
| Severity | high |
| Ecosystem | `kubernetes` |
| Component | `pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview` |
| Affected versions | `vers:semver/1.0.0-beta.1` |
| Date from the source | 2021-08-04 |
| Replacement | authorization.k8s.io/v1 LocalSubjectAccessReview, available since v1.6 |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed` |

## Sources

- [Kubernetes Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/)
- [Kubernetes 1.22: Reaching New Peaks (release announcement, 2021-08-04)](https://kubernetes.io/blog/2021/08/04/kubernetes-1-22-release-announcement/)

## Migration

**Constraints**

- Keep the resource's behavior unchanged: the same name, namespace, labels, and spec semantics.
- The replacement (authorization.k8s.io/v1 LocalSubjectAccessReview, available since v1.6) can differ in required fields or field names from the removed version; read the LocalSubjectAccessReview entry in the Kubernetes Deprecated API Migration Guide and convert the manifest accordingly.

**Steps**

1. **Change the LocalSubjectAccessReview apiVersion.** Change the reported `apiVersion` to the replacement version (authorization.k8s.io/v1 LocalSubjectAccessReview, available since v1.6).
2. **Convert fields the new version changed.** Apply the field changes the migration guide lists for LocalSubjectAccessReview, then check the manifest still expresses the same intent.
3. **Align other LocalSubjectAccessReview declarations.** Update every other manifest, Helm template, and kustomize patch or target that names the old LocalSubjectAccessReview API version, so the repository agrees.

**Verification**

- `kubeconform -strict -summary <manifest-paths>`: Validate the migrated manifests against the schemas of the target Kubernetes version.
- `kubectl apply --dry-run=server -f <manifest-path>`: Ask a cluster on the target version to accept the migrated manifest without applying it.
- `helm template <chart-path> | kubeconform -strict -`: For a Helm chart, render it and validate the output.

## Detected by

The [`kubernetes`](../detectors/kubernetes.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [MutatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.mutatingwebhookconfiguration.v1beta1.removed.html)
- [ValidatingWebhookConfiguration admissionregistration.k8s.io/v1beta1 is no longer served](kubernetes.admissionregistration-k8s-io.validatingwebhookconfiguration.v1beta1.removed.html)
- [CustomResourceDefinition apiextensions.k8s.io/v1beta1 is no longer served](kubernetes.apiextensions-k8s-io.customresourcedefinition.v1beta1.removed.html)
- [APIService apiregistration.k8s.io/v1beta1 is no longer served](kubernetes.apiregistration-k8s-io.apiservice.v1beta1.removed.html)
- [DaemonSet apps/v1beta2 is no longer served](kubernetes.apps.daemonset.v1beta2.removed.html)
- [Deployment apps/v1beta1 is no longer served](kubernetes.apps.deployment.v1beta1.removed.html)
- [Deployment apps/v1beta2 is no longer served](kubernetes.apps.deployment.v1beta2.removed.html)
- [ReplicaSet apps/v1beta1 is no longer served](kubernetes.apps.replicaset.v1beta1.removed.html)


## Data

This page is generated from [`registry/kubernetes.json`](https://github.com/arminazimi/evergreen/blob/main/registry/kubernetes.json), rule `kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html",
      "headline": "LocalSubjectAccessReview authorization.k8s.io/v1beta1 is no longer served — dates, impact, migration",
      "description": "The Kubernetes Deprecated API Migration Guide states that the authorization.k8s.io/v1beta1 API version of LocalSubjectAccessReview is no longer served as of v1.22, which was released on 2021-08-04.",
      "inLanguage": "en",
      "dateModified": "2026-10-20",
      "keywords": [
        "removed",
        "kubernetes",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "LocalSubjectAccessReview authorization.k8s.io/v1beta1 is no longer served",
        "identifier": "pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Kubernetes Deprecated API Migration Guide",
          "url": "https://kubernetes.io/docs/reference/using-api/deprecation-guide/"
        },
        {
          "@type": "CreativeWork",
          "name": "Kubernetes 1.22: Reaching New Peaks (release announcement, 2021-08-04)",
          "url": "https://kubernetes.io/blog/2021/08/04/kubernetes-1-22-release-announcement/"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/kubernetes.authorization-k8s-io.localsubjectaccessreview.v1beta1.removed.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Removed as of 2021-08-04. Affected versions: vers:semver/1.0.0-beta.1. Source: Kubernetes Deprecated API Migration Guide (https://kubernetes.io/docs/reference/using-api/deprecation-guide/)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "authorization.k8s.io/v1 LocalSubjectAccessReview, available since v1.6"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/kubernetes/authorization.k8s.io/LocalSubjectAccessReview."
          }
        }
      ]
    }
  ]
}
</script>
