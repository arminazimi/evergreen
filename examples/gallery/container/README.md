# Container example

Base images past support: old Node.js, PostgreSQL, Redis, Debian, Ubuntu, Alpine, and Python. This directory holds the smallest files that make the container detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/container
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/container --format json
```

The scan is offline and reads the files only.
