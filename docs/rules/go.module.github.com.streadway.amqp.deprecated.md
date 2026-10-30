---
title: "github.com/streadway/amqp is deprecated — dates, impact, migration"
description: "The latest github.com/streadway/amqp module declares: \"Consider using the github.com/rabbitmq/amqp091-go package instead.\""
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.github.com.streadway.amqp.deprecated.html"
json_twin: "/rules/go.module.github.com.streadway.amqp.deprecated.json"
---

# github.com/streadway/amqp is deprecated

The latest github.com/streadway/amqp module declares: "Consider using the github.com/rabbitmq/amqp091-go package instead."

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/github.com/streadway/amqp` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Replacement | github.com/rabbitmq/amqp091-go |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.github.com.streadway.amqp.deprecated` |

## Sources

- [github.com/streadway/amqp v1.1.0 go.mod](https://proxy.golang.org/github.com/streadway/amqp/@v/v1.1.0.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require github.com/streadway/amqp, directly or through a replace directive.
- Check github.com/rabbitmq/amqp091-go for API differences before switching; it may not be a drop-in replacement for every github.com/streadway/amqp call.

**Steps**

1. **Replace the deprecated module.** Replace the github.com/streadway/amqp requirement with github.com/rabbitmq/amqp091-go (`go get github.com/rabbitmq/amqp091-go@latest`), then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of github.com/streadway/amqp in the reported files to github.com/rabbitmq/amqp091-go.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.github.com.streadway.amqp.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.streadway.amqp.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.streadway.amqp.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.streadway.amqp.deprecated.html",
  "headline": "github.com/streadway/amqp is deprecated — dates, impact, migration",
  "description": "The latest github.com/streadway/amqp module declares: \"Consider using the github.com/rabbitmq/amqp091-go package instead.\"",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "github.com/streadway/amqp is deprecated",
    "identifier": "pkg:golang/github.com/streadway/amqp"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "github.com/streadway/amqp v1.1.0 go.mod",
      "url": "https://proxy.golang.org/github.com/streadway/amqp/@v/v1.1.0.mod"
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
