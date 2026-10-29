---
title: Evergreen compared with endoflife.date
---

# Evergreen compared with endoflife.date

endoflife.date is a community database of end-of-life dates with a public API. Evergreen bundles
reviewed lifecycle rules and checks a repository against them. The two answer different halves of
the same question.

## What endoflife.date does better

- **Breadth.** The [product directory](https://endoflife.date/) covers products across many vendors,
  maintained by contributors rather than one project's rule set.
- **A hosted API.** Consumers can query dates over HTTP instead of shipping data with a tool; the
  [API documentation](https://endoflife.date/docs/api) describes the endpoints and response shape.
- **Upstream by design.** A product page is the canonical place to check a date without installing
  anything ([example: Node.js](https://endoflife.date/nodejs)).

## What Evergreen adds

- **Repository context.** Evergreen maps a lifecycle rule to the file, line, and usage in the
  repository, so the answer includes what is affected ([ARCHITECTURE.md](../ARCHITECTURE.md)).
- **Offline operation.** Scans use bundled or cached, verified data and never make a request
  ([DATA.md](../DATA.md)); CI does not depend on a third-party endpoint.
- **Review dates in the result.** Every scan says which data version it used and how old the
  evidence is, and warns when it is stale ([DATA.md](../DATA.md)).
- **Migration context.** Findings carry replacements and verification steps for the change
  ([MIGRATION_PACKETS.md](../MIGRATION_PACKETS.md)).

## Use them together

1. Check the upstream date and its source on endoflife.date.
2. Run `evergreen scan .` to see whether the repository uses the affected release and where.
3. When the repository needs a pinned data version for reproducible CI, follow
   [DATA.md](../DATA.md) instead of relying on a live API response.
