---
title: "Is Amazon EKS end of life? — versions, dates, sources"
description: "Some Amazon EKS releases are end of life. Amazon EKS 1.30 and earlier are past end of extended support. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/amazon-eks.html"
---

# Is Amazon EKS end of life?

**Some Amazon EKS releases are end of life.** Amazon EKS 1.30 and earlier are past end of extended support. The source gives no day. This page lists 4 reviewed lifecycle rules for `pkg:generic/amazon-eks`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/amazon-eks
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [Amazon EKS 1.30 and earlier are past end of extended support](../rules/terraform.eks.end-of-life-1.30-and-older.html) | End of life | The source gives no day | `vers:semver/<1.31.0` | [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) |
| [Amazon EKS 1.33 is past end of standard support](../rules/terraform.eks.end-of-support-1.33.html) | End of support | 2026-07-29 | `vers:semver/>=1.33.0\|<1.34.0` | [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) |
| [Amazon EKS 1.32 is past end of standard support](../rules/terraform.eks.end-of-support-1.32.html) | End of support | 2026-03-23 | `vers:semver/>=1.32.0\|<1.33.0` | [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) |
| [Amazon EKS 1.31 is past end of standard support](../rules/terraform.eks.end-of-support-1.31.html) | End of support | 2025-11-26 | `vers:semver/>=1.31.0\|<1.32.0` | [Amazon EKS: Understand the Kubernetes version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/amazon-eks.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/amazon-eks.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Amazon EKS end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Amazon EKS releases are end of life. Amazon EKS 1.30 and earlier are past end of extended support. The source gives no day. This page lists 4 reviewed lifecycle rules for pkg:generic/amazon-eks, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Amazon EKS?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/amazon-eks."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Amazon EKS dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
