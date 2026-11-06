# Unreviewed expected findings

Generated scan output for a frozen candidate batch. One file per ecosystem, named `<ecosystem>.json`.
Every entry has `reviewState: "unreviewed"`, `source: "scan-output"`, and a `unreviewedExpected`
list. This is a starting point for review, not ground truth.

Do not hand-edit these files. Regenerate them with the candidate finder's batch and a local checkout
per eligible pin:

```sh
node dist/benchmarks/candidates/expected-cli.js generate candidates.json <checkouts-dir> <output-dir>
```

The tool scans `<checkouts-dir>/<owner>--<name>` with the bundled lifecycle data. It never fetches,
installs, builds, or executes repository code. A missing checkout or a scan failure fails the batch
instead of writing a partial result.

Nothing in this directory counts toward reviewed repositories, precision, recall, detector maturity,
or the 200-repository target. Move an entry to `benchmarks/public-repositories/<ecosystem>/` only
after a reviewer has read the pinned file, added a `groundTruthSource`, and replaced
`unreviewedExpected` with `expected`.

Report the two sides separately:

```sh
node dist/benchmarks/candidates/expected-cli.js report
```
