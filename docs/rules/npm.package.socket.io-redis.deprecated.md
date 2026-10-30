---
title: "socket.io-redis is deprecated — dates, impact, migration"
description: "npm marks socket.io-redis as deprecated: \"This package has been renamed to '@socket.io/redis-adapter', please see the migration guide here:…"
canonical_url: "https://arminazimi.github.io/evergreen/rules/npm.package.socket.io-redis.deprecated.html"
json_twin: "/rules/npm.package.socket.io-redis.deprecated.json"
---

# socket.io-redis is deprecated

npm marks socket.io-redis as deprecated: "This package has been renamed to '@socket.io/redis-adapter', please see the migration guide here: https://socket.io/docs/v4/redis-adapter/#migrating-from-socketio-redis"

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | Deprecated |
| Severity | medium |
| Ecosystem | `npm` |
| Component | `pkg:npm/socket.io-redis` |
| Affected versions | `vers:npm/6.0.0\|6.0.1\|6.1.0\|6.1.1` |
| Date from the source | The source gives no day |
| Replacement | @socket.io/redis-adapter |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi, drafted by the `npm-deprecated` importer |
| Review due | 2027-10-19 (365 days after the last review) |
| Rule ID | `npm.package.socket.io-redis.deprecated` |

## Sources

- [socket.io-redis on npm](https://www.npmjs.com/package/socket.io-redis)
- [socket.io-redis version metadata](https://registry.npmjs.org/socket.io-redis)

## Migration

**Constraints**

- Preserve adapter behavior: pub/sub and request/response channels, key prefixes, and multi-node session routing.

**Steps**

1. **Replace the adapter package.** Replace socket.io-redis with @socket.io/redis-adapter and follow the published migration guide for the adapter options.
2. **Verify multi-node behavior.** Connect clients through more than one server instance and confirm broadcasts, rooms, and acknowledgements still work.

**Verification**

- `npm run test --if-present`: Run the realtime and repository tests when defined.

## Detected by

The `npm` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/npm.json`](https://github.com/arminazimi/evergreen/blob/main/registry/npm.json), rule `npm.package.socket.io-redis.deprecated`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/npm.package.socket.io-redis.deprecated.html",
  "url": "https://arminazimi.github.io/evergreen/rules/npm.package.socket.io-redis.deprecated.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/npm.package.socket.io-redis.deprecated.html",
  "headline": "socket.io-redis is deprecated — dates, impact, migration",
  "description": "npm marks socket.io-redis as deprecated: \"This package has been renamed to '@socket.io/redis-adapter', please see the migration guide here:…",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "deprecated",
    "npm",
    "medium"
  ],
  "about": {
    "@type": "Thing",
    "name": "socket.io-redis is deprecated",
    "identifier": "pkg:npm/socket.io-redis"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "socket.io-redis on npm",
      "url": "https://www.npmjs.com/package/socket.io-redis"
    },
    {
      "@type": "CreativeWork",
      "name": "socket.io-redis version metadata",
      "url": "https://registry.npmjs.org/socket.io-redis"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/npm.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
