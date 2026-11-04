# npm example

The deprecated request package. This directory holds the smallest files that make the npm detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/npm scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/npm scan --format json
```

The scan is offline and reads the files only.
