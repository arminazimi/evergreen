# GitHub Actions example

actions/checkout v4, before the v5 Node 24 runtime. This directory holds the smallest files that make the github-actions detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/github-actions
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/github-actions --format json
```

The scan is offline and reads the files only.
