# 0037 — Recommend a release line from bundled data only

Status: accepted

## Problem

Agents write the version their training data remembers: an old Node.js image, a retired
action major. Evergreen's lifecycle data already says which lines have ended or end soon, but
no command or MCP tool turns that into "write this". Adding one changes two public
contracts: a new MCP tool, `recommend_version`, and a new JSON document,
`evergreen.recommend.v1`, printed by `evergreen recommend --json`.

## Decision

Add the `recommend_version` MCP tool, the `evergreen recommend <product|purl>` command, and the
`schemas/recommend.v1.schema.json` document. Both are additive.

- The answer comes only from the bundled registry, through `lookupProduct`. No network.
- A release line is a rule whose range is bounded on both sides (`>=20.0.0|<21.0.0`) and
  whose event ends the line with a date. It qualifies when its end date is at least
  `minimumSupportDays` (default 180) after `asOf`; the boundary day qualifies.
- The newest qualifying line is recommended. The registry does not mark long-term against
  current lines in a structured field, so newest is the only rule it supports today.
- Ranges that are not one line (such as `<5.0.0`) are listed under `avoid` and never
  recommended. A line the registry does not mention is not recommended, because its end date
  is unknown.
- `status` is `recommended`, `no-qualifying-line`, or `no-data`. `no-data` and
  `no-qualifying-line` say the answer is not a statement that any version is safe.
- The output never says "latest". `asOf` is injectable so an answer is repeatable.
- `lookup` also accepts a full Package URL, which selects that product exactly.

## Alternatives rejected

- Query a registry or the network for the newest release. Scans and lookups never use the
  network, and "newest" is not "supported".
- Recommend the lines above the newest dated range. The data gives them no end date, so
  the claim would be unsourced.
