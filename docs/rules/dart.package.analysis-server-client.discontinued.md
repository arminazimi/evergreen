---
title: "analysis_server_client is discontinued on pub.dev — dates, impact, migration"
description: "pub.dev marks analysis_server_client as discontinued."
canonical_url: "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html"
json_twin: "/rules/dart.package.analysis-server-client.discontinued.json"
---

# analysis_server_client is discontinued on pub.dev

**Deprecated.** The source gives no day. Source: [analysis_server_client on pub.dev](https://pub.dev/packages/analysis_server_client).

Check a version:

```bash
evergreen check pkg:pub/analysis_server_client
```

pub.dev marks analysis_server_client as discontinued.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `dart` |
| Component | `pkg:pub/analysis_server_client` |
| Affected versions | `vers:semver/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-21 |
| Reviewed | 2026-10-30 by arminazimi, drafted by the `dart-1` importer |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `dart.package.analysis-server-client.discontinued` |

## Sources

- [analysis_server_client on pub.dev](https://pub.dev/packages/analysis_server_client)
- [analysis_server_client package metadata](https://pub.dev/api/packages/analysis_server_client)
- [Hosted Pub Repository Specification Version 2](https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md)

## Migration

**Constraints**

- analysis_server_client wraps the analysis_server protocol, so replacing it changes the call sites and not only the dependency entry: migrate the pubspec declaration and the Dart code that imports the package together.
- The publisher lists no replacement package on pub.dev, so choose a maintained fork or a direct implementation of the protocol before removing the dependency.

**Steps**

1. **Audit the client call sites.** List every file that imports package:analysis_server_client and the client, server, and protocol calls it makes.
2. **Choose a maintained replacement.** Pick a maintained fork or implement the analysis_server protocol directly, and confirm the choice supports the Dart SDK constraint in environment.sdk.
3. **Replace the dependency.** Update the imports and call sites, replace analysis_server_client in pubspec.yaml, and re-resolve dependencies so pubspec.lock no longer contains it.

**Verification**

- `dart pub get`: Re-resolve dependencies after replacing the package.
- `dart analyze && dart test`: Analyze and test a Dart package on the replacement client.
- `dart analyze && flutter test`: Analyze and test a Flutter app on the replacement client.

## Detected by

The `dart` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [Dart 3.10 no longer receives security updates](dart.sdk.end-of-support-3.10.html)
- [Dart 3.11 no longer receives security updates](dart.sdk.end-of-support-3.11.html)
- [Dart 3.12 no longer receives security updates](dart.sdk.end-of-support-3.12.html)
- [Dart 3.8 no longer receives security updates](dart.sdk.end-of-support-3.8.html)
- [Dart 3.9 no longer receives security updates](dart.sdk.end-of-support-3.9.html)


## Data

This page is generated from [`registry/dart.json`](https://github.com/arminazimi/evergreen/blob/main/registry/dart.json), rule `dart.package.analysis-server-client.discontinued`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html",
      "url": "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html",
      "headline": "analysis_server_client is discontinued on pub.dev — dates, impact, migration",
      "description": "pub.dev marks analysis_server_client as discontinued.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "deprecated",
        "dart",
        "medium"
      ],
      "about": {
        "@type": "Thing",
        "name": "analysis_server_client is discontinued on pub.dev",
        "identifier": "pkg:pub/analysis_server_client"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "analysis_server_client on pub.dev",
          "url": "https://pub.dev/packages/analysis_server_client"
        },
        {
          "@type": "CreativeWork",
          "name": "analysis_server_client package metadata",
          "url": "https://pub.dev/api/packages/analysis_server_client"
        },
        {
          "@type": "CreativeWork",
          "name": "Hosted Pub Repository Specification Version 2",
          "url": "https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/dart.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/dart.package.analysis-server-client.discontinued.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:pub/analysis_server_client?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Deprecated. The source gives no day. Affected versions: vers:semver/*. Source: analysis_server_client on pub.dev (https://pub.dev/packages/analysis_server_client)."
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:pub/analysis_server_client?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:pub/analysis_server_client."
          }
        }
      ]
    }
  ]
}
</script>
