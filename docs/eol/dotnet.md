---
title: "Is .NET end of life? — versions, dates, sources"
description: ".NET has releases that are out of support. .NET 6 is no longer supported as of 2024-11-12."
canonical_url: "https://arminazimi.github.io/evergreen/eol/dotnet.html"
---

# Is .NET end of life?

**.NET has releases that are out of support.** .NET 6 is no longer supported as of 2024-11-12. This page lists 12 reviewed lifecycle rules for `pkg:generic/dotnet`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/dotnet
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [.NET 6 is no longer supported](../rules/dotnet.runtime.end-of-support-6.0.html) | End of support | 2024-11-12 | `vers:semver/>=6.0.0\|<6.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET 7 is no longer supported](../rules/dotnet.runtime.end-of-support-7.0.html) | End of support | 2024-05-14 | `vers:semver/>=7.0.0\|<7.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 3.1 is no longer supported](../rules/dotnet.runtime.end-of-support-3.1.html) | End of support | 2022-12-13 | `vers:semver/>=3.1.0\|<3.2.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET 5 is no longer supported](../rules/dotnet.runtime.end-of-support-5.0.html) | End of support | 2022-05-10 | `vers:semver/>=5.0.0\|<5.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 2.1 is no longer supported](../rules/dotnet.runtime.end-of-support-2.1.html) | End of support | 2021-08-21 | `vers:semver/>=2.1.0\|<2.2.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 3.0 is no longer supported](../rules/dotnet.runtime.end-of-support-3.0.html) | End of support | 2020-03-03 | `vers:semver/>=3.0.0\|<3.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 2.2 is no longer supported](../rules/dotnet.runtime.end-of-support-2.2.html) | End of support | 2019-12-23 | `vers:semver/>=2.2.0\|<2.3.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 1.0 is no longer supported](../rules/dotnet.runtime.end-of-support-1.0.html) | End of support | 2019-06-27 | `vers:semver/>=1.0.0\|<1.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 1.1 is no longer supported](../rules/dotnet.runtime.end-of-support-1.1.html) | End of support | 2019-06-27 | `vers:semver/>=1.1.0\|<1.2.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET Core 2.0 is no longer supported](../rules/dotnet.runtime.end-of-support-2.0.html) | End of support | 2018-10-01 | `vers:semver/>=2.0.0\|<2.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET 8 reaches end of support on 2026-11-10](../rules/dotnet.runtime.end-of-support-8.0.html) | Scheduled end of life | 2026-11-10 | `vers:semver/>=8.0.0\|<8.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |
| [.NET 9 reaches end of support on 2026-11-10](../rules/dotnet.runtime.end-of-support-9.0.html) | Scheduled end of life | 2026-11-10 | `vers:semver/>=9.0.0\|<9.1.0` | [.NET and .NET Core official support policy](https://dotnet.microsoft.com/platform/support/policy/dotnet-core), [.NET releases index (channel, support phase, end-of-life date)](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/dotnet.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/dotnet.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is .NET end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": ".NET has releases that are out of support. .NET 6 is no longer supported as of 2024-11-12. This page lists 12 reviewed lifecycle rules for pkg:generic/dotnet, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check .NET?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/dotnet."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the .NET dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
