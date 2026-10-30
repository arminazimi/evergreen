---
title: "Apache CouchDB image release lines 3.3 and older are end-of-life — dates, impact, migration"
description: "The CouchDB project publishes CVE fixes only for the current release series and its immediate predecessor, so these older release lines receive no security fixes by policy."
canonical_url: "https://arminazimi.github.io/evergreen/rules/container.couchdb.eol-3.3-and-older.html"
json_twin: "/rules/container.couchdb.eol-3.3-and-older.json"
---

# Apache CouchDB image release lines 3.3 and older are end-of-life

The CouchDB project publishes CVE fixes only for the current release series and its immediate predecessor, so these older release lines receive no security fixes by policy.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `container` |
| Component | `pkg:docker/library/couchdb` |
| Affected versions | `vers:semver/<3.4.0` |
| Date from the source | The source gives no day |
| Replacement | A couchdb image on a supported release line |
| Evidence last seen | 2026-10-20 |
| Reviewed | 2026-10-20 by arminazimi, drafted by the `endoflife-date` importer |
| Review due | 2027-10-20 (365 days after the last review) |
| Rule ID | `container.couchdb.eol-3.3-and-older` |

## Sources

- [Apache CouchDB security policy](https://docs.couchdb.org/en/stable/cve/index.html)

## Migration

**Constraints**

- Keep the base image, Compose image, CI service containers, and deployment manifests that use couchdb on one supported CouchDB release line.
- Confirm the application and its data or configuration work on the target CouchDB release; read the vendor's upgrade notes before moving across several release lines.

**Steps**

1. **Update the base image.** Change the reported FROM line or Compose image to a tag on a supported release line, and pin it to a digest if your policy requires.
2. **Align other image references.** Update other Dockerfiles, Compose files, CI service containers, and deployment manifests that use the same image so they agree.

**Verification**

- `docker build .`: Build the image on the new base.
- `docker run --rm IMAGE sh -c 'echo ok'`: Confirm the container starts on the new base.

## Detected by

The [`container`](../detectors/container.md) detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Data

This page is generated from [`registry/container.json`](https://github.com/arminazimi/evergreen/blob/main/registry/container.json), rule `container.couchdb.eol-3.3-and-older`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/container.couchdb.eol-3.3-and-older.html",
  "url": "https://arminazimi.github.io/evergreen/rules/container.couchdb.eol-3.3-and-older.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/container.couchdb.eol-3.3-and-older.html",
  "headline": "Apache CouchDB image release lines 3.3 and older are end-of-life — dates, impact, migration",
  "description": "The CouchDB project publishes CVE fixes only for the current release series and its immediate predecessor, so these older release lines receive no security fixes by policy.",
  "inLanguage": "en",
  "dateModified": "2026-10-20",
  "keywords": [
    "end-of-life",
    "container",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "Apache CouchDB image release lines 3.3 and older are end-of-life",
    "identifier": "pkg:docker/library/couchdb"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "Apache CouchDB security policy",
      "url": "https://docs.couchdb.org/en/stable/cve/index.html"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/container.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
