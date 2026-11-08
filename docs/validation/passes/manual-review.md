---
title: Manual review sample
---

# Manual review sample

Precision and recall measured by hand on a random sample, with the uncertainty stated. The corpus pins its expected findings ahead of time; this pass asks a different question: when a person reads a randomly chosen repository, do they agree with what Evergreen reports, and do they find deprecations it missed?

- **Sample:** 40 repositories per ecosystem (the tool accepts 30 to 50), or the whole ecosystem when it has fewer, drawn from `benchmarks/public-repositories/`. The draw is a seeded shuffle of the sorted repository names, per ecosystem, so it is the same on every machine and one ecosystem's draw does not move when another grows. The seed, the size, and the corpus size per ecosystem are recorded in `benchmarks/manual-review/sample.json`.
- **Review:** a reviewer reads the pinned checkout, gives each finding Evergreen reports a verdict (`correct` or `incorrect`), and lists every deprecation they find that Evergreen did not report. The review stores the reviewer, the date, and every verdict in `benchmarks/manual-review/reviews.json`.
- **Numbers:** precision is correct findings over reported findings; recall is correct findings over correct findings plus misses. Each comes with a 95% Wilson score interval, per ecosystem and overall. A repository without a stored review is not counted, and the report prints how many of the sample have been reviewed.
- **Limits:** the sample is drawn from the pinned corpus, not from all repositories, and a person can miss a deprecation too, so recall is an upper bound.

Run it with the commands in [benchmarks/manual-review/README.md](https://github.com/arminazimi/evergreen/blob/main/benchmarks/manual-review/README.md). No reviews are stored yet; the first results will be added to this page.
