# 0005 — Draft lifecycle rules with importers; never write the registry

Status: accepted

## Decision

Lifecycle rules can be drafted by **importers**: small modules that read one authoritative, machine-readable source and return draft rules in the [v2 format](0004-registry-v2.md). Importers live in `tools/importers/` and implement one interface (`Importer` in `tools/importers/types.ts`): an id, the ecosystem they feed, the sources they read, and `import(context)`.

- **Importers never write the registry.** They return drafts; a maintainer reviews them and changes `registry/` through a pull request. Review is required before any imported fact reaches a rule.
- **The runner owns provenance.** Importers return rules without a `provenance` field. The runner stamps each draft with the run date as `observedAt` and `reviewedAt`, the importer's id as `importer`, and the reviewer `pending-review`. An importer cannot present its output as reviewed, and a test fails if `pending-review` ever appears in a bundled registry.
- **All input goes through the context.** An importer fetches only with `context.fetchText` and reads the time only from `context.now`. That lets tests replay recordings (no network in tests or in `npm run check`) and keeps output deterministic: drafts are sorted by id and key order is canonical.
- **Importers run only in maintainer tooling and scheduled CI.** Scans never use importers, never use the network, and never read drafts.
- **Drafts are validated like any registry.** The runner checks them as a v2 registry for the importer's ecosystem and fails with every problem listed.
- **Evidence policy is unchanged.** Every draft names an authoritative source; an importer that cannot establish a fact records a note and skips it instead of guessing.

## Why

The registry has 15 hand-written rules and will not reach hundreds that way. Authoritative sources such as release schedules and registry metadata already publish most lifecycle facts in machine-readable form. Drafting from them removes transcription errors and keeps every rule traceable, while keeping a human between the source and the data users rely on.

## Consequences

- A new importer is one module plus a recorded response, and shows up in `run --list` once it is added to `tools/importers/index.ts`.
- Draft severity and migration guidance are a starting point; reviewers adjust them.
- Scheduling importers to open data pull requests is a separate decision (it needs the diff and pull-request-body tools first).
