# 0000 — Title

Status: draft

## Summary

One paragraph: what changes, for whom, and why now.

## Motivation

The problem this RFC solves. Who feels it, what it costs today, and what evidence shows it is real. Link to issues, scan output, or measurements instead of describing them from memory.

## Guide-level explanation

Explain the change to someone who uses Evergreen but has not read the code. Show the new command, output, configuration, or workflow, and what changes for existing users.

## Detailed design

The parts an implementer needs: modules and files, data shapes and schemas, error handling, and how the change fits the architecture boundaries in [`AGENTS.md`](../../AGENTS.md#architecture-boundaries). Include examples of the output and note what stays deterministic.

## Drawbacks and risks

What gets harder, slower, or less safe. Include the failure modes and how the RFC avoids or accepts them.

## Alternatives

The options that were considered and why they were not chosen. If the status quo is an option, say what keeps it from being enough.

## Adoption and migration

What existing users and integrations have to change, and whether the change is additive. Public contracts (`schemas/`, `src/sdk.ts`, MCP tool shapes, CLI JSON output) change only additively unless a decision record says otherwise.

## Unresolved questions

The questions this RFC does not answer. Move each to a decision record or a follow-up issue before the status becomes `accepted`.

## References

- Related issues, decision records, and external specifications.
