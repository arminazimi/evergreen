---
title: "Is Google Kubernetes Engine end of life? — versions, dates, sources"
description: "Some Google Kubernetes Engine releases are end of life. GKE 1.31 is past end of extended support as of 2026-10-22."
canonical_url: "https://arminazimi.github.io/evergreen/eol/google-kubernetes-engine.html"
---

# Is Google Kubernetes Engine end of life?

**Some Google Kubernetes Engine releases are end of life.** GKE 1.31 is past end of extended support as of 2026-10-22. This page lists 5 reviewed lifecycle rules for `pkg:generic/google-kubernetes-engine`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/google-kubernetes-engine
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [GKE 1.31 is past end of extended support](../rules/terraform.gke.end-of-life-1.31.html) | End of life | 2026-10-22 | `vers:semver/>=1.31.0\|<1.32.0` | [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) |
| [GKE 1.30 is past end of extended support](../rules/terraform.gke.end-of-life-1.30.html) | End of life | 2026-07-30 | `vers:semver/>=1.30.0\|<1.31.0` | [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) |
| [GKE 1.29 and earlier are no longer supported](../rules/terraform.gke.end-of-life-1.29-and-older.html) | End of life | The source gives no day | `vers:semver/<1.30.0` | [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) |
| [GKE 1.33 is past end of standard support](../rules/terraform.gke.end-of-support-1.33.html) | End of support | 2026-08-12 | `vers:semver/>=1.33.0\|<1.34.0` | [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) |
| [GKE 1.32 is past end of standard support](../rules/terraform.gke.end-of-support-1.32.html) | End of support | 2026-04-27 | `vers:semver/>=1.32.0\|<1.33.0` | [GKE versioning and support](https://cloud.google.com/kubernetes-engine/versioning), [GKE release schedule](https://cloud.google.com/kubernetes-engine/docs/release-schedule) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/google-kubernetes-engine.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/google-kubernetes-engine.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Google Kubernetes Engine end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Google Kubernetes Engine releases are end of life. GKE 1.31 is past end of extended support as of 2026-10-22. This page lists 5 reviewed lifecycle rules for pkg:generic/google-kubernetes-engine, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Google Kubernetes Engine?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/google-kubernetes-engine."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Google Kubernetes Engine dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
