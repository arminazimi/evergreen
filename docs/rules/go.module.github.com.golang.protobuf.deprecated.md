---
title: "github.com/golang/protobuf is deprecated — dates, impact, migration"
description: "The latest github.com/golang/protobuf module declares: \"Use the \"google.golang.org/protobuf\" module instead.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.github.com.golang.protobuf.deprecated.html"
json_twin: "/rules/go.module.github.com.golang.protobuf.deprecated.json"
---

# github.com/golang/protobuf is deprecated

The latest github.com/golang/protobuf module declares: "Use the "google.golang.org/protobuf" module instead."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/github.com/golang/protobuf` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Replacement | google.golang.org/protobuf |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.github.com.golang.protobuf.deprecated` |

## Sources

- [github.com/golang/protobuf v1.5.4 go.mod](https://proxy.golang.org/github.com/golang/protobuf/@v/v1.5.4.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require github.com/golang/protobuf, directly or through a replace directive.
- Check google.golang.org/protobuf for API differences before switching; it may not be a drop-in replacement for every github.com/golang/protobuf call.

**Steps**

1. **Replace the deprecated module.** Replace the github.com/golang/protobuf requirement with google.golang.org/protobuf (`go get google.golang.org/protobuf@latest`), then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of github.com/golang/protobuf in the reported files to google.golang.org/protobuf.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.github.com.golang.protobuf.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.golang.protobuf.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.golang.protobuf.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.golang.protobuf.deprecated.html",
  "headline": "github.com/golang/protobuf is deprecated — dates, impact, migration",
  "description": "The latest github.com/golang/protobuf module declares: \"Use the \"google.golang.org/protobuf\" module instead.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "github.com/golang/protobuf is deprecated",
    "identifier": "pkg:golang/github.com/golang/protobuf"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "github.com/golang/protobuf v1.5.4 go.mod",
      "url": "https://proxy.golang.org/github.com/golang/protobuf/@v/v1.5.4.mod"
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
