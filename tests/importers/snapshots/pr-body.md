Drafts from the `node-schedule` importer for `registry/nodejs.json`, observed 2026-10-15.

These are **drafts**. Each rule below comes from the source linked beside it and has not been reviewed. Nothing is merged until a maintainer has checked it.

## Summary

1 added, 3 changed, 1 removed, 0 unchanged.

## Evidence

| Rule | Change | Date | Source | Observed |
|---|---|---|---|---|
| `nodejs.runtime.eol-24` | added: end-of-life, `pkg:generic/nodejs` `vers:semver/>=24.0.0\|<25.0.0` | 2028-04-30 | [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) | 2026-10-15 |
| `nodejs.runtime.eol-16` | source added: nodejs.org | 2023-09-11 | [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)<br>[Node.js EOL list](https://nodejs.org/en/about/eol) | 2026-10-15 |
| `nodejs.runtime.eol-18` | deadline: 2025-04-30 → 2025-05-15<br>summary changed<br>severity: high → critical | 2025-05-15 | [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) | 2026-10-15 |
| `nodejs.runtime.eol-20` | vers: `vers:semver/>=20.0.0\|<21.0.0` → `vers:semver/>=20.0.0\|<22.0.0` | 2026-04-30 | [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) | 2026-10-15 |
| `nodejs.runtime.eol-14` | no longer drafted by this importer | 2023-04-30 | [Old \| page](https://example.com/old) | 2026-10-01 |

## Skipped or undecided

- Skipped v25: no end date has been published yet.

## Review checklist

- [ ] Each source says what its rule says: the event, the affected versions, and the date.
- [ ] Severity, title, and summary are right for users, and the replacement is real.
- [ ] Removed rules really are gone upstream, not just missing from this run.
- [ ] On approval, set `provenance.reviewer` and `provenance.reviewedAt` on each rule you accept; `pending-review` must not be merged.

## Reproduce

```bash
npm ci && npm run build
node dist/tools/importers/run.js node-schedule --out drafts.json
node dist/tools/importers/diff.js drafts.json registry/nodejs.json
```
