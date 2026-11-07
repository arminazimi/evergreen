# 0036 — Add Deno and Elixir to the public validation schema

Status: accepted

## Problem

`schemas/public-validation.v1.schema.json` lists the ecosystems a pinned public-repository
entry may name. The Deno and Bun detector and the Elixir and Mix detector had no public
corpus, so the enum did not include `deno` or `elixir`. Recording their corpus entries
requires those names.

## Decision

Add `deno` and `elixir` to the `ecosystem` enum of `evergreen.public-validation.v1`.

This is an additive change. Existing entries stay valid. Callers that reject unknown
enum values must accept the two new names; callers that ignore unknown names are unchanged.

Maturity is separate from the enum. Elixir and Mix meets the stable evidence bar in
[decision 0013](0013-detector-maturity.md) and is recorded as stable. Deno and Bun does
not meet the beta bar on the public default branch, so it stays experimental. The enum
admits an ecosystem once it has corpus entries, whether or not its level is stable.

## Alternatives rejected

- Leave the enum closed and store the new entries under another ecosystem. That would
  mis-attribute findings and break the per-ecosystem corpus gates.
- Widen the property to an unconstrained string. The enum is the published list of
  ecosystems the corpus harness scores.
