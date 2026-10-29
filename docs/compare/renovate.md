---
title: Evergreen compared with Renovate
---

# Evergreen compared with Renovate

Renovate automates dependency updates. Evergreen checks whether the dependencies and runtimes a
repository uses are still supported, and shows where they are used. Most repositories benefit from
running both.

## What Renovate does better

- **Automated updates.** Renovate opens pull requests that raise dependency versions, using the
  [package managers it supports](https://docs.renovatebot.com/modules/manager/); the
  [documentation](https://docs.renovatebot.com/) describes the full workflow.
- **Configuration at scale.** [Presets](https://docs.renovatebot.com/presets-default/) and the
  [dependency dashboard](https://docs.renovatebot.com/key-concepts/dashboard/) keep hundreds of
  repositories on one policy.
- **Broader package coverage.** Renovate reports npm deprecation notices for packages Evergreen has
  no rule for; the [differential report](../differential-report.md) lists each such case with the
  npm notice as evidence.

## What Evergreen adds

- **Lifecycle dates and retired APIs.** Rules cover end-of-life runtimes, end-of-support releases,
  deprecated packages, and APIs removed from a runtime, each with a dated source
  ([RULES.md](../RULES.md)).
- **Usage locations.** A finding names the file, line, and declaration or call, not only the
  package ([ARCHITECTURE.md](../ARCHITECTURE.md)).
- **An update-bot preset.** `evergreen renovate-preset .` prints `packageRules` for replacements and
  runtime pins found in the repository; it writes no files
  ([ADOPTION.md](../ADOPTION.md#feeding-renovate)).

## Measured together

The [differential report](../differential-report.md) compares both tools on the same pinned
repositories. It records where they agree, where each found something the other did not, and links
the evidence for every row. On the current corpus Renovate found more npm deprecations (19
Renovate-only rows) while Evergreen found lifecycle problems Renovate did not list (8
Evergreen-only rows). Neither result makes the other tool unnecessary.

## Use them together

1. Keep Renovate for version updates and merge policy.
2. Run `evergreen scan .` to see what is ending and where, including APIs a manifest cannot show.
3. Feed the replacements Evergreen knows about into Renovate with the printed preset, after
   validating it with `renovate-config-validator` as described in
   [ADOPTION.md](../ADOPTION.md#feeding-renovate).
