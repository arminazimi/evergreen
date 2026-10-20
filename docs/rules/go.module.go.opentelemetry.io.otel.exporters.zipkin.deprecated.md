---
title: "go.opentelemetry.io/otel/exporters/zipkin is deprecated — dates, impact, migration"
description: "The latest go.opentelemetry.io/otel/exporters/zipkin module declares: \"The zipkin exporter is deprecated and will be removed in early 2027."
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated.html"
---

# go.opentelemetry.io/otel/exporters/zipkin is deprecated

The latest go.opentelemetry.io/otel/exporters/zipkin module declares: "The zipkin exporter is deprecated and will be removed in early 2027. See the blog post "Deprecating Zipkin Exporter": https://opentelemetry.io/blog/2025/deprecating-zipkin-exporters/"

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/go.opentelemetry.io/otel/exporters/zipkin` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated` |

## Sources

- [go.opentelemetry.io/otel/exporters/zipkin v1.47.0 go.mod](https://proxy.golang.org/go.opentelemetry.io/otel/exporters/zipkin/@v/v1.47.0.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require go.opentelemetry.io/otel/exporters/zipkin, directly or through a replace directive.
- go.opentelemetry.io/otel/exporters/zipkin names no replacement module; pick a maintained alternative or accept the risk, and record the decision.

**Steps**

1. **Replace the deprecated module.** Replace the go.opentelemetry.io/otel/exporters/zipkin requirement with a maintained alternative that fits how the project uses it, then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of go.opentelemetry.io/otel/exporters/zipkin in the reported files to the chosen alternative.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.go.opentelemetry.io.otel.exporters.zipkin.deprecated.html",
  "headline": "go.opentelemetry.io/otel/exporters/zipkin is deprecated — dates, impact, migration",
  "description": "The latest go.opentelemetry.io/otel/exporters/zipkin module declares: \"The zipkin exporter is deprecated and will be removed in early 2027.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "go.opentelemetry.io/otel/exporters/zipkin is deprecated",
    "identifier": "pkg:golang/go.opentelemetry.io/otel/exporters/zipkin"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "go.opentelemetry.io/otel/exporters/zipkin v1.47.0 go.mod",
      "url": "https://proxy.golang.org/go.opentelemetry.io/otel/exporters/zipkin/@v/v1.47.0.mod"
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
