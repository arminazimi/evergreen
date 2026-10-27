# 0017 — Do not read OpenEoX documents yet; keep CLE as the interchange target

Status: accepted

## Problem

The OpenEoX initiative ([OASIS OpenEoX TC](https://github.com/oasis-tcs/openeox)) is building a machine-readable way to publish End-of-Life, End-of-Sales, and End-of-Security-Support information for software and hardware products, and vendors are starting to publish OpenEoX documents. Evergreen therefore has to decide whether, and when, it reads them — and if it does, how an OpenEoX document maps onto the registry v2 format and its events, compared with CLE ([ECMA-428](https://tc54.org/cle)), which the roadmap already targets for export and for maintainer-declared lifecycle data.

The two standards solve different halves of the problem.

| | CLE (ECMA-428) | OpenEoX |
|---|---|---|
| Owner | Ecma TC54-TG3; ratified as ECMA-428 | OASIS OpenEoX TC; Committee Specification Draft |
| Unit | One specific lifecycle event for one component artifact | A whole product's support policy and timeline |
| Vocabulary | Discrete events (`deprecated`, `eol`, `removed`, …) plus component aliasing | Policy milestones: GA, End-of-Sales, End-of-Security-Support, End-of-Life, with support tiers |
| Intended author | Open-source maintainer, one lightweight record | Large commercial software and hardware vendors describing portfolios |
| Identifier fit | `purl`, `vers` — already what registry v2 keys | Product- and edition-level naming, not yet an artifact-coordinate system |

## Decision

1. **Scans never read OpenEoX.** This does not change: repository contents and bundled data only. If OpenEoX is read at all, it happens in an importer (decision 0005), run only in maintainer tooling, fetching through `context.fetchText` and producing reviewed drafts.

2. **No OpenEoX ingestion until the Core Schema reaches Committee Specification (final, not draft).** The Core Schema is still a draft and can change shape; rules are long-lived and a schema churn now becomes churn in the registry's provenance for years. Until then the roadmap's CLE work (export, validation, maintainer-declared CLE lifecycle) is the standards story, and issue 261 covers reading maintainer-declared lifecycle.

3. **The intended mapping, recorded now so the reading is ready in principle.** When an OpenEoX product-level milestone can be pinned to versioned artifacts it maps cleanly onto registry events:

   | OpenEoX milestone | Evergreen event | Note |
   |---|---|---|
   | General Availability | — | Nothing to flag; a GA date is context, not risk |
   | End-of-Sales | — or `scheduled-end-of-life` | A sales cutoff on a versioned product line is worth a low-severity scheduled note when a date is announced (decision 0010); purchasing support is not itself a lifecycle event |
   | End-of-Security-Support | `end-of-support` | Matches Evergreen's meaning: the line stops receiving security fixes |
   | End-of-Life | `end-of-life` | Cessation of all support |

   Evergreen's `deprecated` and `removed` events have no OpenEoX equivalent; they stay fed by deprecation metadata and API-removal guides.
   - A milestone that covers a **whole product or edition** (no version range) cannot become a rule, because rules are keyed by `purl` and `vers`. Such documents are useful to a future ecosystem-level feed (calendar, notes), not the registry; draft nothing from them.
   - OpenEoX's richer policy model (support tiers, regional variations, dependency relationships) is out of the mapping's scope. Where tiers give several End-of-Security-Support or End-of-Life dates for one artifact, a draft uses the **most conservative date** — the earliest end among the tiers the artifact is actually on — and records the others in the rule's sources. Evergreen does not model support tiers.
   - Component identity is the risky half: OpenEoX names products and editions, while rules need coordinates. Any future ingestion maps an OpenEoX product to a `purl` only where the naming is unambiguous (well-known `pkg:generic/<name>` conventions), and leaves the rest as review notes rather than guessing (the registry evidence policy: never infer).
   - Alias/identity handoff: where a component's identity changes over time, CLE's aliasing is the mechanism to name it, and OpenEoX documents may reference CLE identifiers; a future importer follows those references instead of inventing its own identity scheme.

4. **Revisit triggers.** Reopen this decision when at least one of: the OpenEoX Core Schema passes Committee Specification; a maintainer names a concrete OpenEoX source whose data is otherwise unreachable (a vendor publishes only via OpenEoX); or the CLE interop work (issue 261, issue 263) surfaces a standing OpenEoX demand from Ecma TC54.

## Alternatives considered

- **Ingest OpenEoX now as an importer.** Concrete, but the schema is draft; drafts stamped `observedAt` today could encode field shapes that vanish in the final specification. The CLE path delivers the same class of facts from a ratified standard.
- **Reject OpenEoX outright.** The mapping above shows it is not competing with CLE — it is the vendor-policy layer CLE users increasingly point at. A flat rejection would force re-litigating the analysis when the standard lands.
- **Map OpenEoX support tiers onto per-rule severities.** Severity describes consequence, not contract; encoding "extended support" as a low-severity rule invents a semantics Evergreen does not have. Most-conservative-date with recorded sources keeps one meaning per event.

## Consequences

- No code, schema, registry, or scan behavior changes. Offline stays offline; this decision adds a document, and any future importer inherits decision 0005's constraints unchanged.
- The `docs/rules/` pages already tell readers a CLE export is not published; nothing here changes that status.
- When ingestion starts, a follow-up issue under the Lifecycle standards epic carries the implementation; this ADR stays the decision record.
