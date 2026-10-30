---
title: "github.com/cncf/udpa/go is deprecated — dates, impact, migration"
description: "The latest github.com/cncf/udpa/go module declares: \"use github.com/cncf/xds/go instead.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.github.com.cncf.udpa.go.deprecated.html"
json_twin: "/rules/go.module.github.com.cncf.udpa.go.deprecated.json"
---

# github.com/cncf/udpa/go is deprecated

**Deprecated.** The source gives no day. Replacement: github.com/cncf/xds/go. Source: [github.com/cncf/udpa/go v0.0.0-20220112060539-c52dc94e7fbe go.mod](https://proxy.golang.org/github.com/cncf/udpa/go/@v/v0.0.0-20220112060539-c52dc94e7fbe.mod).

Check a version:

```bash
evergreen check pkg:golang/github.com/cncf/udpa/go
```

The latest github.com/cncf/udpa/go module declares: "use github.com/cncf/xds/go instead."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/github.com/cncf/udpa/go` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Replacement | github.com/cncf/xds/go |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.github.com.cncf.udpa.go.deprecated` |

## Sources

- [github.com/cncf/udpa/go v0.0.0-20220112060539-c52dc94e7fbe go.mod](https://proxy.golang.org/github.com/cncf/udpa/go/@v/v0.0.0-20220112060539-c52dc94e7fbe.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require github.com/cncf/udpa/go, directly or through a replace directive.
- Check github.com/cncf/xds/go for API differences before switching; it may not be a drop-in replacement for every github.com/cncf/udpa/go call.

**Steps**

1. **Replace the deprecated module.** Replace the github.com/cncf/udpa/go requirement with github.com/cncf/xds/go (`go get github.com/cncf/xds/go@latest`), then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of github.com/cncf/udpa/go in the reported files to github.com/cncf/xds/go.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.github.com.cncf.udpa.go.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.cncf.udpa.go.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.cncf.udpa.go.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.cncf.udpa.go.deprecated.html",
  "headline": "github.com/cncf/udpa/go is deprecated — dates, impact, migration",
  "description": "The latest github.com/cncf/udpa/go module declares: \"use github.com/cncf/xds/go instead.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "github.com/cncf/udpa/go is deprecated",
    "identifier": "pkg:golang/github.com/cncf/udpa/go"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "github.com/cncf/udpa/go v0.0.0-20220112060539-c52dc94e7fbe go.mod",
      "url": "https://proxy.golang.org/github.com/cncf/udpa/go/@v/v0.0.0-20220112060539-c52dc94e7fbe.mod"
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
