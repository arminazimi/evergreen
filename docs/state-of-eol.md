---
title: State of EOL
---

# State of EOL

A citable summary of lifecycle risk in Evergreen's public benchmark corpus: every expected finding at a pinned commit, aggregated by product and release line. The tables below regenerate from the corpus and the last recorded full run; they are a census of that corpus, not a sample of the open-source world.

## Findings

<!-- state-of-eol:start -->
The aggregate tables are built from the corpus and the last recorded full run when the site is built, so they are not committed and a corpus change never edits this page. Build them locally with `node dist/tools/coverage-matrix.js --site`; the live page is at <https://arminazimi.github.io/evergreen/state-of-eol.html>.
<!-- state-of-eol:end -->

## Limits

Counts come from expected findings in `benchmarks/public-repositories/`, joined to bundled rules in `registry/`. Scans never use the network. A product with no corpus finding does not appear here.
