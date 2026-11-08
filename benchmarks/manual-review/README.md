# Manual review sample

`sample.json` is a random sample of 30 to 50 pinned repositories per ecosystem (40 by default), drawn from `benchmarks/public-repositories/` with the seed stored in the file. `reviews.json` holds the hand reviews: who read which repository at which commit, a verdict on every finding Evergreen reported, and every deprecation the reviewer found that it did not. Method and results: [docs/validation/passes/manual-review.md](../../docs/validation/passes/manual-review.md).

```bash
npm run build --silent
node dist/benchmarks/manual-review/review.js sample --seed <text>   # redraw (same seed, same corpus: same sample)
node dist/benchmarks/manual-review/review.js todo                   # sampled repositories with no review yet
node dist/benchmarks/manual-review/review.js record --file review.json
node dist/benchmarks/manual-review/review.js report [--json]        # precision and recall with 95% Wilson intervals
```

A review file is one `ReviewEntry` (see `review.ts`): `repository`, `commit`, `ecosystem`, `reviewer`, `reviewedAt`, `findings` (`ruleId`, `path`, `line`, `verdict` of `correct` or `incorrect`), `missed` (`path`, `line`, `note`), and an optional `note`. The tool refuses a repository that is not in the sample or already has a review.
