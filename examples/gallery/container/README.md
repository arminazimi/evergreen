# Container example

Base images past support: old Node.js, PostgreSQL, Redis, Debian, Ubuntu, Alpine, and Python. This directory holds the smallest files that make the container detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/container scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/container scan --format json
```

The scan is offline and reads the files only.
