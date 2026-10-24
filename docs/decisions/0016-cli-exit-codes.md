# 0016 — CLI exit codes and error codes

Status: accepted

## Problem

Every CLI failure exited 1 or 2, and 1 meant both "a gate you set failed" and "something went wrong" (a finding that was not found, a refused data update, a damaged `AGENTS.md`). An agent could not tell a policy verdict from an operational failure without reading the message.

## Decision

Failures belong to one of five classes with fixed exit codes: `policy` 1, `usage` 2, `data` 3, `parse` 4, `internal` 5. The class is also the `error.code` of an `evergreen.error.v1` document written to stdout under `--json`. See [Exit codes and error codes](../CAPABILITIES.md#exit-codes-and-error-codes).

`policy` (1) and `usage` (2) keep their meaning. These cases change, because they were not policy or usage failures:

| Case | Before | After |
| --- | --- | --- |
| Pinned data version that is not available | 2 | 3 (`data`) |
| `data update` refused or failed | 1 | 3 (`data`) |
| Finding not found (`explain`, `context`, `report-issue`) | 1 | 3 (`data`) |
| Invalid Package URL | 2 | 4 (`parse`) |
| Unsupported or unreadable baseline | 1 (uncaught) | 4 (`parse`) |
| Damaged `AGENTS.md` section (`init --agents`) | 1 | 4 (`parse`) |
| Unexpected error | 1 (stack trace) | 5 (`internal`) |

A malformed `--data-version` stays a usage error (2).

## Consequences

A script that only tests for non-zero is unaffected. A script that compared against 1 or 2 for the cases above must be updated. The error document is additive: stdout of a failing `--json` command was empty before.
