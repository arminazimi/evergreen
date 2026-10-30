---
title: "fennec is retired on Hex — dates, impact, migration"
description: "Hex marks every published fennec release as retired with reason renamed, and the retirement message says the package was renamed to mongooseice."
canonical_url: "https://arminazimi.github.io/evergreen/rules/elixir.package.fennec.retired.html"
json_twin: "/rules/elixir.package.fennec.retired.json"
---

# fennec is retired on Hex

**Deprecated.** The source gives no day. Replacement: mongooseice. Source: [fennec on Hex](https://hex.pm/packages/fennec).

Check a version:

```bash
evergreen check pkg:hex/fennec
```

Hex marks every published fennec release as retired with reason renamed, and the retirement message says the package was renamed to mongooseice.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | high |
| Ecosystem | `elixir` |
| Component | `pkg:hex/fennec` |
| Affected versions | `vers:semver/*` |
| Date from the source | The source gives no day |
| Replacement | mongooseice |
| Evidence last seen | 2026-10-26 |
| Reviewed | 2026-10-26 by arminazimi |
| Review due | 2027-01-24 (90 days after the last review) |
| Rule ID | `elixir.package.fennec.retired` |

## Sources

- [fennec on Hex](https://hex.pm/packages/fennec)
- [mongooseice on Hex](https://hex.pm/packages/mongooseice)

## Migration

**Constraints**

- Preserve STUN/TURN configuration and call sites while moving from fennec to mongooseice.
- Keep mix.exs and mix.lock consistent after the replacement.

**Steps**

1. **Replace the dependency.** Remove {:fennec, …} from mix.exs deps and add {:mongooseice, …} at a maintained version, then run mix deps.get.
2. **Migrate fennec usages.** Update application and module references from Fennec to MongooseICE as the mongooseice package documents.

**Verification**

- `mix deps.get && mix deps | grep mongooseice`: Confirm mongooseice is resolved into the Mix dependency tree.
- `mix test`: Run the Mix test suite with the replacement package.

## Detected by

The `elixir` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/elixir.json`](https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json), rule `elixir.package.fennec.retired`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/elixir.package.fennec.retired.html",
  "url": "https://arminazimi.github.io/evergreen/rules/elixir.package.fennec.retired.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/elixir.package.fennec.retired.html",
  "headline": "fennec is retired on Hex — dates, impact, migration",
  "description": "Hex marks every published fennec release as retired with reason renamed, and the retirement message says the package was renamed to mongooseice.",
  "inLanguage": "en",
  "dateModified": "2026-10-26",
  "keywords": [
    "deprecated",
    "elixir",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "fennec is retired on Hex",
    "identifier": "pkg:hex/fennec"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "fennec on Hex",
      "url": "https://hex.pm/packages/fennec"
    },
    {
      "@type": "CreativeWork",
      "name": "mongooseice on Hex",
      "url": "https://hex.pm/packages/mongooseice"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/elixir.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
