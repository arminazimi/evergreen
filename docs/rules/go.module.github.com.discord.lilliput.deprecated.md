---
title: "github.com/discord/lilliput is deprecated — dates, impact, migration"
description: "The latest github.com/discord/lilliput module declares: \"discord/lilliput is unmaintained as of October 2026. There will be no further releases, including for security fixes."
canonical_url: "https://arminazimi.github.io/evergreen/rules/go.module.github.com.discord.lilliput.deprecated.html"
---

# github.com/discord/lilliput is deprecated

The latest github.com/discord/lilliput module declares: "discord/lilliput is unmaintained as of October 2026. There will be no further releases, including for security fixes. See https://github.com/discord/lilliput/issues/303"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `go` |
| Component | `pkg:golang/github.com/discord/lilliput` |
| Affected versions | `vers:golang/*` |
| Date from the source | The source gives no day |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi |
| Review due | 2027-04-18 (180 days after the last review) |
| Rule ID | `go.module.github.com.discord.lilliput.deprecated` |

## Sources

- [github.com/discord/lilliput v1.5.1 go.mod](https://proxy.golang.org/github.com/discord/lilliput/@v/v1.5.1.mod)
- [Go module deprecation reference](https://go.dev/ref/mod#go-mod-file-module-deprecation)

## Migration

**Constraints**

- Keep go.mod and go.sum consistent: after the change no package should still require github.com/discord/lilliput, directly or through a replace directive.
- github.com/discord/lilliput names no replacement module; pick a maintained alternative or accept the risk, and record the decision.

**Steps**

1. **Replace the deprecated module.** Replace the github.com/discord/lilliput requirement with a maintained alternative that fits how the project uses it, then run `go mod tidy`.
2. **Migrate imports and calls.** Update imports and calls of github.com/discord/lilliput in the reported files to the chosen alternative.

**Verification**

- `go build ./... && go test ./...`: Build and test every package without the deprecated module.
- `go mod tidy && git diff --exit-code go.mod go.sum`: Confirm go.mod and go.sum are tidy after the replacement.

## Detected by

The [`go`](../detectors/go.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/go.json`](https://github.com/arminazimi/evergreen/blob/main/registry/go.json), rule `go.module.github.com.discord.lilliput.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.discord.lilliput.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.discord.lilliput.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/go.module.github.com.discord.lilliput.deprecated.html",
  "headline": "github.com/discord/lilliput is deprecated — dates, impact, migration",
  "description": "The latest github.com/discord/lilliput module declares: \"discord/lilliput is unmaintained as of October 2026. There will be no further releases, including for security fixes.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "deprecated",
    "go",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "github.com/discord/lilliput is deprecated",
    "identifier": "pkg:golang/github.com/discord/lilliput"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "github.com/discord/lilliput v1.5.1 go.mod",
      "url": "https://proxy.golang.org/github.com/discord/lilliput/@v/v1.5.1.mod"
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
