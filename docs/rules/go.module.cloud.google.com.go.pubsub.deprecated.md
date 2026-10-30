---
title: "cloud.google.com/go/pubsub is deprecated — dates, impact, migration"
description: "The latest cloud.google.com/go/pubsub module declares: \"use cloud.google.com/go/pubsub/v2 instead. This version will be supported with bug fixes and security patches until December 31st, 2026."
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.cloud.google.com.go.pubsub.deprecated.html"
json_twin: "/rules/go.module.cloud.google.com.go.pubsub.deprecated.json"
---

# cloud.google.com/go/pubsub is deprecated

The latest cloud.google.com/go/pubsub module declares: "use cloud.google.com/go/pubsub/v2 instead. This version will be supported with bug fixes and security patches until December 31st, 2026. For migration, see https://github.com/googleapis/google-cloud-go/blob/main/pubsub/MIGRATING.md"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/cloud.google.com/go/pubsub` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Replacement | cloud.google.com/go/pubsub/v2 |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.cloud.google.com.go.pubsub.deprecated` |

## Sources

- [cloud.google.com/go/pubsub v1.51.1 go.mod](https://proxy.golang.org/cloud.google.com/go/pubsub/@v/v1.51.1.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require cloud.google.com/go/pubsub, directly or through a replace directive.
- Check cloud.google.com/go/pubsub/v2 for API differences before switching; it may not be a drop-in replacement for every cloud.google.com/go/pubsub call.

**Steps**

1. **Replace the deprecated module.** Replace the cloud.google.com/go/pubsub requirement with cloud.google.com/go/pubsub/v2 (`go get cloud.google.com/go/pubsub/v2@latest`), then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of cloud.google.com/go/pubsub in the reported files to cloud.google.com/go/pubsub/v2.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.cloud.google.com.go.pubsub.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.cloud.google.com.go.pubsub.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.cloud.google.com.go.pubsub.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.cloud.google.com.go.pubsub.deprecated.html",
  "headline": "cloud.google.com/go/pubsub is deprecated — dates, impact, migration",
  "description": "The latest cloud.google.com/go/pubsub module declares: \"use cloud.google.com/go/pubsub/v2 instead. This version will be supported with bug fixes and security patches until December 31st, 2026.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "cloud.google.com/go/pubsub is deprecated",
    "identifier": "pkg:golang/cloud.google.com/go/pubsub"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "cloud.google.com/go/pubsub v1.51.1 go.mod",
      "url": "https://proxy.golang.org/cloud.google.com/go/pubsub/@v/v1.51.1.mod"
    },
    {
      "@type": "CreativeWork",
      "name": "Go module deprecation reference",
      "url": "https://go.dev/ref/mod#go-mod-file-module-deprecation"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/go.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
