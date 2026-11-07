# Agent staleness benchmark

Measures how often coding agents write end-of-life or deprecated choices when they produce common project files, with and without Evergreen's agent hook.

## Layout

| Path | Role |
| --- | --- |
| `tasks.json` | Prompt set (≥40 tasks). Prompts never name versions. |
| `run.ts` | Maintainer harness: calls real agents (network). Not part of `npm run check`. |
| `score.ts` | Offline scorer: scans committed outputs with `scanRepository`. |
| `outputs/<agent>/<arm>/<task>/` | Produced files plus `meta.json`. |
| `results.json` | Last offline score (`npm run bench:staleness:score -- --write`). |

Arms:

- `plain` — empty temporary directory; no Evergreen setup.
- `hooks` — same task after `evergreen init --agents` and, when the host supports it, `init --hooks-for <host>`.

The `outputs/seed/` tree is **hand-written seed data** for offline tests. It is not a real agent run. Replace or extend it when the maintainer commits the first measured run (at least three agents, both arms).

## Commands

```bash
npm ci
npm run build --silent

# Offline score (also exercised by unit tests in npm run check):
npm run bench:staleness:score
npm run bench:staleness:score -- --write   # refresh results.json

# Maintainer-only agent run (network + agent CLIs):
npm run bench:staleness:run -- --list
npm run bench:staleness:run -- --agent claude-code
npm run bench:staleness:run -- --agent codex --task dockerfile-node-app --arm plain
```

Method, limits, and the published table live in [docs/BENCHMARKS.md](../../docs/BENCHMARKS.md#agent-staleness-benchmark).
