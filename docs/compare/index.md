---
title: Evergreen compared with other tools
---

# Evergreen compared with other tools

Evergreen answers one question: **what in this repository is ending, and where is it used?**
Update bots and lifecycle databases answer neighbouring questions. This section states what each
tool is good at, links the evidence for every claim, and says where Evergreen is the weaker choice.

| Tool | Question it answers | Start with |
| --- | --- | --- |
| Renovate | Which dependencies have newer versions, and can the update be automated? | [Renovate compared](renovate.md) |
| Dependabot | Which dependencies have updates or security advisories on GitHub? | [Dependabot compared](dependabot.md) |
| endoflife.date | When does a product or release line stop receiving support? | [endoflife.date compared](endoflife-date.md) |

## Where Evergreen differs

- **Evidence, not just a version number.** Every rule names its sources and the date a maintainer
  reviewed it ([RULES.md](../RULES.md)); scans report the data version and age
  ([DATA.md](../DATA.md)).
- **Locations.** Findings point at the exact declaration or usage
  ([ARCHITECTURE.md](../ARCHITECTURE.md)), including retired APIs inside source files, which
  manifest-only tools cannot see.
- **Offline and deterministic.** Scans read local files and bundled data only
  ([DATA.md](../DATA.md)); no account or hosted service is involved.

## Measured, not asserted

Where Evergreen and Renovate can speak about the same dependency in the same file, the
[differential report](../differential-report.md) compares their results on a pinned corpus and links
the evidence for each disagreement, including the cases Renovate finds and Evergreen misses. The
method is described in [VALIDATION.md](../VALIDATION.md#differential-testing-against-renovate).
