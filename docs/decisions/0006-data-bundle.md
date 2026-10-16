# 0006 — Ship lifecycle data as a versioned, content-addressed bundle

Status: accepted

## Decision

Lifecycle data can be published and consumed separately from the Evergreen code release as a **data bundle**, one JSON document of type `evergreen.data-bundle.v1` ([schema](../../schemas/data-bundle.v1.schema.json)). It holds a manifest and the files the detectors read.

```json
{
  "manifest": {
    "schemaVersion": "evergreen.data-bundle.v1",
    "version": "2026.10.16",
    "createdAt": "2026-10-16T09:30:00Z",
    "minimumEvergreenVersion": "0.2.0",
    "contentDigest": "sha256:…",
    "files": [
      { "path": "registry/npm.json", "kind": "registry", "ecosystem": "npm", "schemaVersion": "evergreen.registry.v2", "rules": 23, "maxReviewAgeDays": 365, "sha256": "…", "bytes": 41234 }
    ]
  },
  "files": { "registry/npm.json": { "schemaVersion": "evergreen.registry.v2", "…": "…" } }
}
```

**Contents.** The registries (`registry/<ecosystem>.json`, `evergreen.registry.v2`) and the GitHub Actions SHA map (`registry/github-actions-shas.json`, `kind: sha-map`). Source-freshness locks, importer drafts, and corpora are maintainer tooling and are not shipped.

**Canonical form and digests.** Every file is stored as parsed JSON. Its digest is the SHA-256 of its *canonical JSON*: object keys sorted by UTF-16 code unit at every level, no insignificant whitespace, UTF-8, integers only (the registries contain no other numbers). Formatting, key order, and line endings in `registry/` therefore never change a digest. `bytes` is the length of that canonical form.

**Content address.** `contentDigest` is `sha256:` plus the SHA-256 of the lines `<path> <sha256>\n` for every file, sorted by path. It identifies the data and does not depend on `version` or `createdAt`: two bundles with the same `contentDigest` carry the same data.

**Version.** `version` is calendar-based, `YYYY.MM.DD`, with `.N` appended (`2026.10.16.2`) for further bundles on the same day. `createdAt` is supplied to the build (the release commit's date), not read from a clock, so building the same commit twice gives the same bundle byte for byte.

**Compatibility.** A consumer refuses a bundle when `schemaVersion` is not one it understands, when `minimumEvergreenVersion` is newer than itself, or when any registry's `schemaVersion` is unknown to it. Refusal is not an error for the user: the data bundled with the installed package is used instead, with a visible warning.

**Trust.** The bundle is signed as a single file with a keyless Sigstore signature from the repository's data-release workflow; the signature is a detached Sigstore bundle published next to it. A consumer accepts data only if the signature verifies against the workflow identity, the manifest digests match the files, and every registry validates. Verification needs no network. This record fixes the format; signing and verification are separate steps.

**Freshness and downgrade.** `createdAt` is how old the evidence is; every registry also carries its `maxReviewAgeDays`. An updater refuses a bundle whose `createdAt` is older than the active one unless the user pins that version, so replaying an old but validly signed bundle does not roll data back.

## Why

Rules are the product, and they go stale in days, not at the pace of code releases. A separate, signed channel lets users get new evidence without upgrading Evergreen, while scans stay offline: a bundle is fetched only by an explicit command and read from disk.

A single JSON file keeps the trust boundary simple: one object to sign, hash, cache, and pin, with no archive format to parse before verification. Canonical JSON makes digests independent of how the registries are formatted, and a content address makes "same data" checkable without comparing versions.

## Consequences

- The bundle must be rebuilt, byte for byte, from `registry/` and the commit date; CI checks that two builds give the same digest.
- Detectors read rules through one loader that prefers verified cached data, then falls back to the bundled files. Findings from either source are identical for identical rules.
- Adding a data file kind or changing canonicalization needs a new `schemaVersion`; adding registries does not.
- Pinning a version for reproducible CI means pinning a `version` or `contentDigest`.
